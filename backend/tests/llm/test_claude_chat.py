"""ClaudeChat and the llm_provider setting (CN-2.2). A fake client stands in for the Anthropic API, so no test
needs a key or a network connection."""

import asyncio
import inspect
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx
import pytest

from legallens.models.llm import ClaudeChat, LLMError, LLMResult, OllamaChat, get_llm, local_status
from legallens.models.spend import GuardedChat
from tests.conftest import make_settings

CANARY = "ZEBRA-CANARY-7f3a9c"


class _Stream:
    def __init__(self, pieces: list[str], usage: SimpleNamespace, fail: Exception | None) -> None:
        self.pieces, self.usage, self.fail = pieces, usage, fail

    async def __aenter__(self) -> "_Stream":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    @property
    def text_stream(self) -> Any:
        async def pieces() -> Any:
            for piece in self.pieces:
                yield piece
            if self.fail:
                raise self.fail

        return pieces()

    async def get_final_message(self) -> SimpleNamespace:
        return SimpleNamespace(usage=self.usage)


class FakeAnthropic:
    """The part of AsyncAnthropic that ClaudeChat uses: messages.create and messages.stream."""

    def __init__(self, text: str = "30 days", tokens_in: int = 120, tokens_out: int = 3, fail: Exception | None = None):
        self.text, self.fail = text, fail
        self.usage = SimpleNamespace(input_tokens=tokens_in, output_tokens=tokens_out)
        self.calls: list[dict[str, Any]] = []
        self.messages = SimpleNamespace(create=self._create, stream=self._stream)

    @staticmethod
    def _check(method: Any, kwargs: dict[str, Any]) -> None:
        """Reject any argument the real SDK would reject, which a loose fake hid before (CN-2.4)."""
        accepted = set(inspect.signature(method).parameters)
        unknown = set(kwargs) - accepted
        assert not unknown, f"the Anthropic SDK does not accept {sorted(unknown)}"

    async def _create(self, **kwargs: Any) -> SimpleNamespace:
        self._check(anthropic.resources.messages.AsyncMessages.create, kwargs)
        self.calls.append(kwargs)
        if self.fail:
            raise self.fail
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self.text)], usage=self.usage)

    def _stream(self, **kwargs: Any) -> _Stream:
        self._check(anthropic.resources.messages.AsyncMessages.stream, kwargs)
        self.calls.append(kwargs)
        return _Stream(self.text.split("|"), self.usage, self.fail)


def _chat(client: FakeAnthropic, default_model: str = "claude-haiku-5-5") -> ClaudeChat:
    return ClaudeChat("sk-ant-test", default_model=default_model, timeout=5, retries=0, client=client)


def _api_error(status: int) -> anthropic.APIStatusError:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(status, request=request, json={"error": {"message": f"echo {CANARY}"}})
    return anthropic.APIStatusError(f"boom {CANARY}", response=response, body=None)


def test_complete_returns_text_and_the_token_counts_the_api_reports() -> None:
    fake = FakeAnthropic()
    result = asyncio.run(_chat(fake).complete("claude-sonnet-5-5", "sys", "usr", max_tokens=64, temperature=0.2))
    assert result == LLMResult(text="30 days", tokens_in=120, tokens_out=3, model="claude-sonnet-5-5")
    sent = fake.calls[0]
    assert sent["model"] == "claude-sonnet-5-5"
    assert sent["system"] == "sys"
    assert sent["messages"] == [{"role": "user", "content": "usr"}]
    assert sent["max_tokens"] == 64
    assert "temperature" not in sent  # the SDK has no such argument


def test_an_ollama_model_name_is_answered_by_the_default_claude_model() -> None:
    fake = FakeAnthropic()
    result = asyncio.run(_chat(fake).complete("qwen2.5:7b-instruct", "s", "u"))
    assert fake.calls[0]["model"] == "claude-haiku-5-5"
    assert result.model == "claude-haiku-5-5"


def test_stream_full_yields_pieces_then_one_result_with_the_counts() -> None:
    fake = FakeAnthropic(text="The |notice |is 30 days.", tokens_in=50, tokens_out=7)

    async def run() -> list[str | LLMResult]:
        return [item async for item in _chat(fake).stream_full("m", "s", "u")]

    items = asyncio.run(run())
    assert items[:3] == ["The ", "notice ", "is 30 days."]
    assert items[3] == LLMResult(text="The notice is 30 days.", tokens_in=50, tokens_out=7, model="claude-haiku-5-5")


def test_stream_yields_only_text() -> None:
    fake = FakeAnthropic(text="a|b")

    async def run() -> list[str]:
        return [piece async for piece in _chat(fake).stream("m", "s", "u")]

    assert asyncio.run(run()) == ["a", "b"]


@pytest.mark.parametrize("status", [401, 429, 500])
def test_an_api_error_raises_llm_error_with_the_status_and_no_prompt_text(status: int) -> None:
    fake = FakeAnthropic(fail=_api_error(status))
    with pytest.raises(LLMError) as raised:
        asyncio.run(_chat(fake).complete("claude-haiku-5-5", "sys", f"question {CANARY}"))
    assert str(status) in str(raised.value)
    assert CANARY not in str(raised.value)


def test_a_failure_while_streaming_is_an_llm_error_too() -> None:
    fake = FakeAnthropic(text="partial", fail=_api_error(500))

    async def run() -> None:
        async for _ in _chat(fake).stream_full("m", "s", f"question {CANARY}"):
            pass

    with pytest.raises(LLMError) as raised:
        asyncio.run(run())
    assert CANARY not in str(raised.value)


def test_a_missing_key_fails_the_call_not_the_construction() -> None:
    chat = ClaudeChat(None, default_model="claude-haiku-5-5", timeout=5, retries=0)
    with pytest.raises(LLMError, match="API key"):
        asyncio.run(chat.complete("m", "s", "u"))
    assert asyncio.run(chat.ping()) is False


def test_ping_makes_no_call() -> None:
    fake = FakeAnthropic()
    assert asyncio.run(_chat(fake).ping()) is True
    assert fake.calls == []


def test_the_provider_defaults_to_local(tmp_path) -> None:  # type: ignore[no-untyped-def]
    settings = make_settings(tmp_path)
    assert settings.llm_provider == "local"
    assert isinstance(get_llm(settings), OllamaChat)


def test_the_claude_provider_returns_claude_chat_behind_the_guard_with_the_key(tmp_path) -> None:  # type: ignore[no-untyped-def]
    settings = make_settings(tmp_path, llm_provider="claude", anthropic_api_key="sk-ant-test")
    chat = get_llm(settings)
    assert isinstance(chat, GuardedChat)
    assert isinstance(chat.inner, ClaudeChat)
    assert chat.inner.api_key == "sk-ant-test"
    assert "sk-ant-test" not in repr(settings)  # a SecretStr never prints


def test_health_with_claude_checks_the_key_and_never_calls_out(tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def refuse(*args: object, **kwargs: object) -> None:
        raise AssertionError("health must not make a network call with the Claude provider")

    monkeypatch.setattr(httpx, "get", refuse)
    no_key = make_settings(tmp_path, llm_provider="claude")
    with_key = make_settings(tmp_path, llm_provider="claude", anthropic_api_key="sk-ant-test")
    assert local_status(no_key)[0] is False
    assert local_status(with_key) == (True, "Claude · claude-haiku-5-5 · $0.0000 of $5.00 spent")
