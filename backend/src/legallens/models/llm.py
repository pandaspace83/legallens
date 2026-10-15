"""The local language model behind one interface (WORKFLOWS_TODO W6).

OllamaChat talks to an Ollama server on this machine only (DEC-08). Nothing here knows about prompts or
documents: it takes messages and returns text, so a bigger local model (or another provider) is a settings
change, not a code change. Calls are async so a long answer never blocks the server.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Coroutine
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from legallens.config import Settings


class LLMError(Exception):
    """The model could not be reached or answered badly. The message never contains prompt text."""


@dataclass(frozen=True)
class LLMResult:
    text: str
    tokens_in: int
    tokens_out: int
    model: str


class ChatModel(Protocol):
    async def complete(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> LLMResult: ...

    def stream(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str]: ...

    def stream_full(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str | LLMResult]:
        """Text pieces as they arrive, then one LLMResult with the whole text and the token counts."""
        ...

    async def ping(self) -> bool: ...


class OllamaChat:
    def __init__(
        self,
        url: str,
        *,
        context_tokens: int,
        timeout: float,
        retries: int,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not url.startswith(("http://127.0.0.1", "http://localhost")):
            raise ValueError("The language model must run on this machine (DEC-08).")
        self.url = url.rstrip("/")
        self.context_tokens = context_tokens
        self.timeout = timeout
        self.retries = retries
        self.transport = transport  # tests only

    def _body(
        self, model: str, system: str, user: str, max_tokens: int, temperature: float, stream: bool
    ) -> dict[str, object]:
        return {
            "model": model,
            "stream": stream,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "options": {"num_predict": max_tokens, "temperature": temperature, "num_ctx": self.context_tokens},
        }

    async def complete(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> LLMResult:
        body = self._body(model, system, user, max_tokens, temperature, stream=False)
        # Only a refused connection is retried (Ollama still starting). A timeout already waited the full limit,
        # and an HTTP error (model not pulled, out of memory) won't change on a second try.
        for attempt in range(self.retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
                    response = await client.post(f"{self.url}/api/chat", json=body)
                    response.raise_for_status()
                data = response.json()
                return LLMResult(
                    text=str(data["message"]["content"]),
                    tokens_in=int(data.get("prompt_eval_count", 0)),
                    tokens_out=int(data.get("eval_count", 0)),
                    model=model,
                )
            except httpx.ConnectError as exc:
                if attempt == self.retries:
                    raise LLMError(f"ConnectError calling model {model}") from exc
                await asyncio.sleep(1)
            except httpx.HTTPStatusError as exc:
                raise LLMError(f"HTTP {exc.response.status_code} calling model {model}") from exc
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                raise LLMError(f"{type(exc).__name__} calling model {model}") from exc
        raise LLMError(f"no attempt made calling model {model}")

    async def stream(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str]:
        body = self._body(model, system, user, max_tokens, temperature, stream=True)
        try:
            client = httpx.AsyncClient(timeout=self.timeout, transport=self.transport)
            async with client, client.stream("POST", f"{self.url}/api/chat", json=body) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    piece = json.loads(line).get("message", {}).get("content", "")
                    if piece:
                        yield piece
        except (httpx.HTTPError, ValueError) as exc:
            raise LLMError(f"{type(exc).__name__} streaming from model {model}") from exc

    async def stream_full(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str | LLMResult]:
        body = self._body(model, system, user, max_tokens, temperature, stream=True)
        parts: list[str] = []
        tokens_in = tokens_out = 0
        try:
            client = httpx.AsyncClient(timeout=self.timeout, transport=self.transport)
            async with client, client.stream("POST", f"{self.url}/api/chat", json=body) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    piece = data.get("message", {}).get("content", "")
                    if piece:
                        parts.append(piece)
                        yield piece
                    if data.get("done"):
                        tokens_in = int(data.get("prompt_eval_count", 0))
                        tokens_out = int(data.get("eval_count", 0))
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise LLMError(f"{type(exc).__name__} streaming from model {model}") from exc
        yield LLMResult(text="".join(parts), tokens_in=tokens_in, tokens_out=tokens_out, model=model)

    async def ping(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2, transport=self.transport) as client:
                return (await client.get(f"{self.url}/api/tags")).status_code == 200
        except httpx.HTTPError:
            return False


def get_llm(settings: Settings) -> ChatModel:
    return OllamaChat(
        settings.llm_url,
        context_tokens=settings.llm_context_tokens,
        timeout=settings.llm_timeout_seconds,
        retries=settings.llm_retries,
    )


def local_status(settings: Settings) -> tuple[bool, str]:
    """(ok, detail) for /health: is Ollama up, and are the configured models pulled?"""
    try:
        response = httpx.get(f"{settings.llm_url.rstrip('/')}/api/tags", timeout=2)
        response.raise_for_status()
        pulled = {m["name"] for m in response.json().get("models", [])}
    except (httpx.HTTPError, ValueError, KeyError):
        return False, "Ollama is not running: answers fall back to quoted passages"
    wanted = {
        settings.llm_rewrite_model,
        settings.llm_answer_model,
        settings.llm_summary_model,
        settings.llm_summary_long_model,
        settings.llm_draft_model,
    }
    have = {n.removesuffix(":latest") for n in pulled}
    missing = sorted(w for w in wanted if w.removesuffix(":latest") not in have)
    if missing:
        return False, f"not pulled: {', '.join(missing)}. Run `ollama pull <name>`."
    return True, f"{settings.llm_answer_model} · prompt ask-local-1"


def run_sync(coro: Coroutine[Any, Any, Any]) -> Any:
    """Run an async LLM call from the synchronous job worker, on a loop of its own so it can never collide
    with a loop already running in the calling thread."""
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()
