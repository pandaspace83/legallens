"""The Claude spend guard (CN-2.3, DEC-96, DEC-103).

Every Claude call passes through `GuardedChat`. Before a call it refuses when the running total has reached the cap or
the model has no price, so nothing is sent; after a call it adds the cost from the token counts the API reported.
The total lives in a file of its own (`claude_spend.db` in the data folder), not in the main database: `legallens db
reset` deletes the main database, and the ledger must not reset with it. It holds no client data, only the time,
the model, the token counts and the cost of each call.

The guard is a second safety net. The spend limit set in the provider's console is the hard stop. One call can cross
the cap, because its cost is only known afterwards; the next one is refused. A stream that breaks before its final
token count arrives is not recorded.
"""

import logging
import os
import sqlite3
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_CEILING, Decimal
from pathlib import Path

from legallens.config import Settings
from legallens.models.llm import ClaudeChat, LLMError, LLMResult

log = logging.getLogger("legallens.spend")

MICROS = 1_000_000


class SpendError(LLMError):
    """A call was refused before anything was sent. The message holds dollar figures only, never prompt text."""


class SpendCapReached(SpendError):
    pass


@dataclass(frozen=True)
class Price:
    """US dollars per million tokens, which is the same number as micro-dollars per token."""

    input: Decimal
    output: Decimal
    long_input: Decimal | None = None  # the prices when the prompt is longer than `long_over` tokens
    long_output: Decimal | None = None
    long_over: int = 100_000


# List prices from Anthropic's pricing page, checked 2026-11-04. Thinking tokens are part of the output count the API
# reports. A model that is not here is refused rather than assumed free.
PRICES: dict[str, Price] = {
    "claude-haiku-5-5": Price(Decimal("0.10"), Decimal("0.50"), Decimal("0.50"), Decimal("2.50")),
    "claude-sonnet-5-5": Price(Decimal("2"), Decimal("10")),
    "claude-opus-5-5": Price(Decimal("4"), Decimal("20")),
}


def price_for(model: str) -> Price:
    """The price for a model id, also matching a dated id such as `claude-haiku-5-5-20261101`."""
    if model in PRICES:
        return PRICES[model]
    for name in sorted(PRICES, key=len, reverse=True):
        if model.startswith(f"{name}-"):
            return PRICES[name]
    raise SpendError(f"No price is set for model {model}, so the call was not made.")


def cost_micros(model: str, tokens_in: int, tokens_out: int) -> int:
    """The cost of one call in micro-dollars, rounded up so the total never runs low."""
    price = price_for(model)
    long = price.long_input is not None and price.long_output is not None and tokens_in > price.long_over
    per_in = price.long_input if long and price.long_input is not None else price.input
    per_out = price.long_output if long and price.long_output is not None else price.output
    return int((Decimal(tokens_in) * per_in + Decimal(tokens_out) * per_out).to_integral_value(ROUND_CEILING))


def dollars(micros: int) -> str:
    return f"${micros / MICROS:.4f}" if micros < 10_000 else f"${micros / MICROS:.2f}"


class SpendLedger:
    """The running total, kept in a small SQLite file so it survives restarts and is shared by every process."""

    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS calls ("
                "id INTEGER PRIMARY KEY, at TEXT NOT NULL, model TEXT NOT NULL, tokens_in INTEGER NOT NULL, "
                "tokens_out INTEGER NOT NULL, cost_micros INTEGER NOT NULL)"
            )
        if os.name == "posix":
            path.chmod(0o600)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=10, isolation_level=None)

    def total_micros(self) -> int:
        with self._connect() as conn:
            return int(conn.execute("SELECT COALESCE(SUM(cost_micros), 0) FROM calls").fetchone()[0])

    def add(self, model: str, tokens_in: int, tokens_out: int) -> tuple[int, int]:
        """Record one call; returns (its cost, the new total), both in micro-dollars."""
        cost = cost_micros(model, tokens_in, tokens_out)
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")  # one writer at a time, so two processes cannot lose an update
            conn.execute(
                "INSERT INTO calls (at, model, tokens_in, tokens_out, cost_micros) VALUES (?, ?, ?, ?, ?)",
                (datetime.now(UTC).isoformat(timespec="seconds"), model, tokens_in, tokens_out, cost),
            )
            total = int(conn.execute("SELECT SUM(cost_micros) FROM calls").fetchone()[0])
            conn.execute("COMMIT")
        return cost, total


class SpendGuard:
    def __init__(self, ledger: SpendLedger, *, cap_usd: float, warn_ratio: float) -> None:
        self.ledger = ledger
        self.cap_micros = int(Decimal(str(cap_usd)) * MICROS)
        self.warn_micros = int(Decimal(str(cap_usd)) * Decimal(str(warn_ratio)) * MICROS)

    def check(self, model: str) -> None:
        """Raise before any call is made if the model has no price or the cap is reached."""
        price_for(model)
        total = self.ledger.total_micros()
        if total >= self.cap_micros:
            raise SpendCapReached(
                f"The Claude spend cap of {dollars(self.cap_micros)} is reached ({dollars(total)} spent); "
                "no call was made."
            )

    def record(self, result: LLMResult) -> None:
        cost, total = self.ledger.add(result.model, result.tokens_in, result.tokens_out)
        if total >= self.cap_micros > total - cost:
            log.warning("Claude spend cap reached: %s of %s", dollars(total), dollars(self.cap_micros))
        elif total >= self.warn_micros > total - cost:
            log.warning("Claude spend is past the warning level: %s of %s", dollars(total), dollars(self.cap_micros))


class GuardedChat:
    """ClaudeChat behind the spend guard, with the same interface."""

    def __init__(self, inner: ClaudeChat, guard: SpendGuard) -> None:
        self.inner = inner
        self.guard = guard

    async def complete(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> LLMResult:
        self.guard.check(self.inner.resolve_model(model))
        result = await self.inner.complete(model, system, user, max_tokens=max_tokens, temperature=temperature)
        self.guard.record(result)
        return result

    async def stream(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str]:
        async for item in self.stream_full(model, system, user, max_tokens=max_tokens, temperature=temperature):
            if isinstance(item, str):
                yield item

    async def stream_full(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str | LLMResult]:
        self.guard.check(self.inner.resolve_model(model))
        async for item in self.inner.stream_full(model, system, user, max_tokens=max_tokens, temperature=temperature):
            if isinstance(item, LLMResult):
                self.guard.record(item)
            yield item

    async def ping(self) -> bool:
        return await self.inner.ping()


def spend_summary(settings: Settings) -> tuple[int, int]:
    """(spent, cap) in micro-dollars, for /health. It never creates the ledger file."""
    cap = int(Decimal(str(settings.claude_spend_cap_usd)) * MICROS)
    if not settings.spend_ledger_path.exists():
        return 0, cap
    return SpendLedger(settings.spend_ledger_path).total_micros(), cap
