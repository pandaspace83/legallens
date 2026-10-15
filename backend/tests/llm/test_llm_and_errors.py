"""The local LLM layer and the per-failure error log (WORKFLOWS_TODO W6, W7)."""

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from legallens.models.llm import LLMError, OllamaChat, get_llm
from legallens.orchestrator.errors import log_failure
from tests.conftest import make_settings

CANARY = "ZEBRA-CANARY-7f3a9c"


def _chat(handler, retries: int = 0) -> OllamaChat:  # type: ignore[no-untyped-def]
    return OllamaChat(
        "http://127.0.0.1:11434",
        context_tokens=4096,
        timeout=5,
        retries=retries,
        transport=httpx.MockTransport(handler),
    )


def test_complete_returns_text_and_real_token_counts() -> None:
    seen: list[dict] = []  # type: ignore[type-arg]

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": "30 days"}, "prompt_eval_count": 120, "eval_count": 3})

    result = asyncio.run(_chat(handler).complete("m", "sys", "usr", max_tokens=64))
    assert (result.text, result.tokens_in, result.tokens_out, result.model) == ("30 days", 120, 3, "m")
    assert seen[0]["options"]["num_predict"] == 64
    assert seen[0]["options"]["num_ctx"] == 4096
    assert [m["role"] for m in seen[0]["messages"]] == ["system", "user"]


def test_stream_yields_pieces_in_order() -> None:
    lines = "\n".join(json.dumps({"message": {"content": p}}) for p in ["The ", "notice ", "is 30 days."])

    async def run() -> list[str]:
        chat = _chat(lambda request: httpx.Response(200, text=lines))
        return [piece async for piece in chat.stream("m", "s", "u")]

    assert asyncio.run(run()) == ["The ", "notice ", "is 30 days."]


def test_a_failing_server_raises_llm_error_without_prompt_text() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(500, text=f"boom {CANARY}")

    with pytest.raises(LLMError) as raised:
        asyncio.run(_chat(handler, retries=2).complete("m", "sys", f"question {CANARY}"))
    assert len(calls) == 1  # a server error is not retried (review finding 7)
    assert CANARY not in str(raised.value)


def test_a_timeout_is_not_retried_but_a_refused_connection_is() -> None:
    """Review finding 7: retrying a timeout doubles a long wait; a refused connection (Ollama starting) is worth
    one more try; a 404 (model not pulled) never is."""
    calls: list[str] = []

    def timeout(request: httpx.Request) -> httpx.Response:
        calls.append("t")
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(LLMError):
        asyncio.run(_chat(timeout, retries=2).complete("m", "s", "u"))
    assert calls == ["t"]

    calls.clear()

    def refused_then_ok(request: httpx.Request) -> httpx.Response:
        calls.append("c")
        if len(calls) == 1:
            raise httpx.ConnectError("refused", request=request)
        return httpx.Response(200, json={"message": {"content": "ok"}})

    assert asyncio.run(_chat(refused_then_ok, retries=2).complete("m", "s", "u")).text == "ok"
    assert calls == ["c", "c"]

    calls.clear()

    def not_pulled(request: httpx.Request) -> httpx.Response:
        calls.append("404")
        return httpx.Response(404, json={"error": "model not found"})

    with pytest.raises(LLMError):
        asyncio.run(_chat(not_pulled, retries=2).complete("m", "s", "u"))
    assert calls == ["404"]


def test_the_model_must_run_on_this_machine() -> None:
    with pytest.raises(ValueError, match="this machine"):
        OllamaChat("https://api.example.com", context_tokens=1, timeout=1, retries=0)


def test_get_llm_reads_settings(tmp_path: Path) -> None:
    chat = get_llm(make_settings(tmp_path, llm_context_tokens=2048))
    assert isinstance(chat, OllamaChat)
    assert chat.context_tokens == 2048


def test_every_failure_gets_its_own_file_named_after_the_error(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    try:
        raise LLMError(f"ReadTimeout calling model qwen {CANARY}")
    except LLMError as exc:
        first = log_failure(settings, exc, stage="answer", run_id="run_1", matter_id="mat_1", model="qwen")
        second = log_failure(settings, exc, stage="answer")
    try:
        raise ValueError("bad value")
    except ValueError as exc:
        third = log_failure(settings, exc, stage="rewrite")

    assert first != second  # a new file every time
    assert first.parent == settings.error_log_dir
    assert first.name.startswith("LLMError_") and first.suffix == ".log"
    assert third.name.startswith("ValueError_")
    body = first.read_text()
    assert "stage:   answer" in body and "run:     run_1" in body and "model:   qwen" in body
    assert "Traceback" in body
    assert len(list(settings.error_log_dir.iterdir())) == 3


def test_the_log_is_outside_the_source_tree(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    assert settings.error_log_dir == tmp_path / "logs" / "errors"
    assert "src" not in settings.error_log_dir.relative_to(tmp_path).parts


def test_other_errors_log_their_frames_but_not_their_message(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    try:
        raise KeyError(f"passage text {CANARY}")
    except KeyError as exc:
        path = log_failure(settings, exc, stage="verify")
    body = path.read_text()
    assert CANARY not in body
    assert "KeyError" in body and "Traceback" in body
