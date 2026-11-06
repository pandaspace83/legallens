"""The Claude spend guard (CN-2.3, DEC-96, DEC-103): prices, the running total, the warning and the refusal.
Fake token counts stand in for the API, so no test needs a key or a network connection."""

import asyncio
import logging
from decimal import Decimal
from pathlib import Path

import pytest

from legallens.models.llm import ClaudeChat, LLMResult, get_llm, local_status
from legallens.models.spend import (
    GuardedChat,
    SpendCapReached,
    SpendError,
    SpendGuard,
    SpendLedger,
    cost_micros,
    price_for,
)
from tests.conftest import make_settings

CANARY = "ZEBRA-CANARY-7f3a9c"


class FakeClaude:
    """The part of ClaudeChat that the guard uses. Counts how many calls were really made."""

    def __init__(self, tokens_in: int = 1000, tokens_out: int = 100, model: str = "claude-haiku-5-5") -> None:
        self.tokens_in, self.tokens_out, self.model = tokens_in, tokens_out, model
        self.calls = 0

    def resolve_model(self, model: str) -> str:
        return model if model.startswith("claude-") else "claude-haiku-5-5"

    def _result(self) -> LLMResult:
        return LLMResult(text="ok", tokens_in=self.tokens_in, tokens_out=self.tokens_out, model=self.model)

    async def complete(self, model: str, system: str, user: str, **kwargs: object) -> LLMResult:
        self.calls += 1
        return self._result()

    async def stream_full(self, model: str, system: str, user: str, **kwargs: object):  # type: ignore[no-untyped-def]
        self.calls += 1
        yield "o"
        yield "k"
        yield self._result()

    async def ping(self) -> bool:
        return True


def _guarded(tmp_path: Path, fake: FakeClaude, cap_usd: float = 5.0) -> tuple[GuardedChat, SpendLedger]:
    ledger = SpendLedger(tmp_path / "claude_spend.db")
    guard = SpendGuard(ledger, cap_usd=cap_usd, warn_ratio=0.8)
    return GuardedChat(fake, guard), ledger  # type: ignore[arg-type]


def test_cost_comes_from_the_token_counts_at_list_prices() -> None:
    assert cost_micros("claude-haiku-5-5", 3000, 300) == 450  # $0.10 in, $0.50 out per million tokens
    assert cost_micros("claude-sonnet-5-5", 1_000_000, 1_000_000) == 12_000_000  # $2 + $10
    assert cost_micros("claude-opus-5-5", 1_000_000, 1_000_000) == 24_000_000  # $4 + $20
    assert cost_micros("claude-haiku-5-5", 0, 0) == 0


def test_cost_is_rounded_up_so_the_total_never_runs_low() -> None:
    assert cost_micros("claude-haiku-5-5", 1, 0) == 1  # $0.10 per million tokens is 0.1 micro-dollar per token


def test_haiku_costs_more_for_a_prompt_over_100000_tokens() -> None:
    assert cost_micros("claude-haiku-5-5", 100_000, 0) == 10_000  # at the line: the normal price
    assert cost_micros("claude-haiku-5-5", 100_001, 0) == 50_001  # over it: $0.50 per million input tokens
    assert cost_micros("claude-haiku-5-5", 100_001, 1000) == 50_001 + 2_500


def test_a_dated_model_id_gets_the_price_of_its_family() -> None:
    assert price_for("claude-haiku-5-5-20261101").output == Decimal("0.50")


def test_a_model_with_no_price_is_refused_before_a_call(tmp_path) -> None:  # type: ignore[no-untyped-def]
    fake = FakeClaude(model="claude-mystery-9")
    chat, _ = _guarded(tmp_path, fake)
    with pytest.raises(SpendError, match="No price"):
        asyncio.run(chat.complete("claude-mystery-9", "s", "u"))
    assert fake.calls == 0


def test_each_call_adds_to_the_total_using_the_models_the_api_reported(tmp_path) -> None:  # type: ignore[no-untyped-def]
    fake = FakeClaude(tokens_in=3000, tokens_out=300)
    chat, ledger = _guarded(tmp_path, fake)
    asyncio.run(chat.complete("qwen2.5:7b-instruct", "s", "u"))
    asyncio.run(chat.complete("claude-haiku-5-5", "s", "u"))
    assert ledger.total_micros() == 900
    assert fake.calls == 2


def test_the_total_survives_a_restart(tmp_path) -> None:  # type: ignore[no-untyped-def]
    path = tmp_path / "claude_spend.db"
    SpendLedger(path).add("claude-sonnet-5-5", 1_000_000, 0)
    assert SpendLedger(path).total_micros() == 2_000_000  # a new object, as after a restart


def test_it_refuses_at_the_cap_and_never_calls_out_again(tmp_path) -> None:  # type: ignore[no-untyped-def]
    fake = FakeClaude(tokens_in=1_000_000, tokens_out=0, model="claude-sonnet-5-5")  # $2 a call
    chat, ledger = _guarded(tmp_path, fake, cap_usd=5.0)
    for _ in range(3):  # $2, $4, $6: the third call crosses the cap, because its cost is known only afterwards
        asyncio.run(chat.complete("claude-sonnet-5-5", "s", "u"))
    assert (fake.calls, ledger.total_micros()) == (3, 6_000_000)
    with pytest.raises(SpendCapReached) as raised:
        asyncio.run(chat.complete("claude-sonnet-5-5", "s", f"question {CANARY}"))
    assert fake.calls == 3  # nothing was sent
    assert CANARY not in str(raised.value)
    assert "$5.00" in str(raised.value)


def test_streaming_is_refused_at_the_cap_too_and_is_recorded_when_allowed(tmp_path) -> None:  # type: ignore[no-untyped-def]
    fake = FakeClaude(tokens_in=1_000_000, tokens_out=0, model="claude-sonnet-5-5")
    chat, ledger = _guarded(tmp_path, fake, cap_usd=1.0)

    async def run() -> list[object]:
        return [item async for item in chat.stream_full("claude-sonnet-5-5", "s", "u")]

    assert [type(i).__name__ for i in asyncio.run(run())] == ["str", "str", "LLMResult"]
    assert ledger.total_micros() == 2_000_000
    with pytest.raises(SpendCapReached):
        asyncio.run(run())
    with pytest.raises(SpendCapReached):
        asyncio.run(_drain(chat))
    assert fake.calls == 1


async def _drain(chat: GuardedChat) -> None:
    async for _ in chat.stream("claude-sonnet-5-5", "s", "u"):
        pass


def test_it_warns_once_when_the_total_passes_80_percent(tmp_path, caplog) -> None:  # type: ignore[no-untyped-def]
    fake = FakeClaude(tokens_in=1_000_000, tokens_out=0, model="claude-sonnet-5-5")  # $2 a call
    chat, _ = _guarded(tmp_path, fake, cap_usd=5.0)
    with caplog.at_level(logging.WARNING, logger="legallens.spend"):
        asyncio.run(chat.complete("claude-sonnet-5-5", "s", "u"))  # $2
        asyncio.run(chat.complete("claude-sonnet-5-5", "s", "u"))  # $4: exactly 80%
        assert [r.message for r in caplog.records if "warning level" in r.message] != []
        caplog.clear()
        asyncio.run(chat.complete("claude-sonnet-5-5", "s", "u"))  # $6: past the cap
    assert [r for r in caplog.records if "warning level" in r.message] == []  # not again
    assert [r for r in caplog.records if "cap reached" in r.message] != []


def test_the_cap_can_be_set_lower(tmp_path) -> None:  # type: ignore[no-untyped-def]
    fake = FakeClaude(tokens_in=3000, tokens_out=300)  # 450 micro-dollars a call
    chat, _ = _guarded(tmp_path, fake, cap_usd=0.0005)
    asyncio.run(chat.complete("claude-haiku-5-5", "s", "u"))
    asyncio.run(chat.complete("claude-haiku-5-5", "s", "u"))  # 900 >= 500
    with pytest.raises(SpendCapReached):
        asyncio.run(chat.complete("claude-haiku-5-5", "s", "u"))


def test_get_llm_shares_one_total_across_instances_and_resets_nothing_on_db_reset(tmp_path) -> None:  # type: ignore[no-untyped-def]
    settings = make_settings(tmp_path, llm_provider="claude", anthropic_api_key="sk-ant-test")
    first, second = get_llm(settings), get_llm(settings)
    assert isinstance(first, GuardedChat) and isinstance(first.inner, ClaudeChat)
    first.guard.ledger.add("claude-sonnet-5-5", 1_000_000, 0)
    assert second.guard.ledger.total_micros() == 2_000_000
    assert settings.spend_ledger_path != settings.db_path  # `db reset` deletes the main database only
    assert settings.spend_ledger_path.parent == settings.data_dir


def test_health_shows_the_spend_and_goes_unhealthy_at_the_cap(tmp_path) -> None:  # type: ignore[no-untyped-def]
    settings = make_settings(tmp_path, llm_provider="claude", anthropic_api_key="sk-ant-test", claude_spend_cap_usd=1.0)
    assert local_status(settings) == (True, "Claude · claude-haiku-5-5 · $0.0000 of $1.00 spent")
    assert not settings.spend_ledger_path.exists()  # a health check creates nothing
    SpendLedger(settings.spend_ledger_path).add("claude-sonnet-5-5", 600_000, 0)  # $1.20
    ok, detail = local_status(settings)
    assert ok is False
    assert "cap reached" in detail
