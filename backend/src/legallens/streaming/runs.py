"""Chat runs in the API process: each run is an asyncio task with a numbered, buffered event log.

The run starts when the message is posted, not when the stream opens, so a late or dropped EventSource loses
nothing: it reconnects with Last-Event-ID and the buffer replays from there (TA frame 3). Stop cancels the task;
the run ends with `done {cancelled: true}` and the partial answer is kept, marked cancelled.
"""

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.orchestrator.base import Orchestrator, RunContext
from legallens.services.chat import TurnRecorder, dumps

log = logging.getLogger("legallens.runs")


@dataclass
class RunState:
    run_id: str
    matter_id: str
    conversation_id: str
    events: list[tuple[int, str, dict[str, Any]]] = field(default_factory=list)
    finished: bool = False
    finished_at: float | None = None
    status: str = "running"
    task: asyncio.Task[None] | None = None
    changed: asyncio.Condition = field(default_factory=asyncio.Condition)


class RunRegistry:
    def __init__(self, database: Database, settings: Settings) -> None:
        self.database = database
        self.settings = settings
        self.runs: dict[str, RunState] = {}

    # ------------------------------------------------------------ lifecycle

    def start(self, ctx: RunContext, orchestrator: Orchestrator) -> RunState:
        self._collect_garbage()
        state = RunState(run_id=ctx.run_id, matter_id=ctx.matter_id, conversation_id=ctx.conversation_id)
        self.runs[ctx.run_id] = state
        state.task = asyncio.create_task(self._drive(state, ctx, orchestrator), name=f"run-{ctx.run_id}")
        return state

    async def _publish(self, state: RunState, event: str, data: dict[str, Any]) -> None:
        async with state.changed:
            state.events.append((len(state.events) + 1, event, data))
            state.changed.notify_all()

    async def _drive(self, state: RunState, ctx: RunContext, orchestrator: Orchestrator) -> None:
        recorder = TurnRecorder(self.database, ctx)
        await self._publish(state, "run.started", {"run_id": ctx.run_id, "message_id": ctx.assistant_message_id})
        try:
            async for event in orchestrator.run(ctx):
                for name, data in await recorder.handle(event):
                    await self._publish(state, name, data)
            totals = await recorder.finish("complete")
            state.status = "done"
            await self._publish(state, "done", totals)
        except asyncio.CancelledError:
            state.status = "cancelled"
            await asyncio.shield(recorder.finish("cancelled"))
            await self._publish(state, "done", {"cancelled": True, "message_id": ctx.assistant_message_id})
        except Exception as exc:
            from legallens.errors import ApiError

            state.status = "failed"
            log.exception("run_failed", extra={"run_id": ctx.run_id, "error_type": type(exc).__name__})
            if isinstance(exc, ApiError):
                error = {"code": exc.code, "message": exc.detail}
            else:
                error = {"code": "internal_error", "message": "The answer could not be completed. Try again."}
            try:
                await recorder.finish("failed", error)
            except Exception:
                log.exception("run_finish_failed", extra={"run_id": ctx.run_id})
            await self._publish(state, "error", error)
        finally:
            async with state.changed:
                state.finished = True
                state.finished_at = time.monotonic()
                state.changed.notify_all()

    def get(self, run_id: str) -> RunState | None:
        return self.runs.get(run_id)

    async def cancel(self, run_id: str, wait_seconds: float = 3.0) -> str | None:
        state = self.runs.get(run_id)
        if state is None:
            return None
        if state.task is not None and not state.task.done():
            state.task.cancel()
            with contextlib.suppress(TimeoutError, asyncio.CancelledError):
                await asyncio.wait_for(asyncio.shield(state.task), timeout=wait_seconds)
        return state.status

    def cancel_matter(self, matter_id: str) -> None:
        for state in self.runs.values():
            if state.matter_id == matter_id and state.task is not None and not state.task.done():
                state.task.cancel()

    def cancel_conversation(self, conversation_id: str) -> None:
        for state in self.runs.values():
            if state.conversation_id == conversation_id and state.task is not None and not state.task.done():
                state.task.cancel()

    async def shutdown(self) -> None:
        tasks = [s.task for s in self.runs.values() if s.task is not None and not s.task.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def _collect_garbage(self) -> None:
        ttl = self.settings.run_buffer_ttl_seconds
        now = time.monotonic()
        for run_id in [
            rid
            for rid, s in self.runs.items()
            if s.finished and s.finished_at is not None and now - s.finished_at > ttl
        ]:
            del self.runs[run_id]

    # ------------------------------------------------------------ streaming

    async def stream(self, run_id: str, last_event_id: int = 0) -> AsyncIterator[dict[str, str]]:
        state = self.runs[run_id]
        position = max(0, last_event_id)
        while True:
            async with state.changed:
                while position >= len(state.events) and not state.finished:
                    await state.changed.wait()
                batch = state.events[position:]
                finished = state.finished
            for seq, name, data in batch:
                yield {"id": str(seq), "event": name, "data": dumps(data)}
            position += len(batch)
            if finished and position >= len(state.events):
                return
