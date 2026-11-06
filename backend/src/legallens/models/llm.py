"""The language model behind one interface (WORKFLOWS_TODO W6).

OllamaChat talks to an Ollama server on this machine only (DEC-08). ClaudeChat talks to Anthropic and is used
only when `llm_provider` is "claude" (DEC-94). Nothing here knows about prompts or documents: it takes messages
and returns text, so a bigger model (or another provider) is a settings change, not a code change. Calls are
async so a long answer never blocks the server.
"""

import asyncio
import json
from collections.abc import AsyncIterator, Coroutine
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Protocol

import anthropic
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


class ClaudeChat:
    """Claude through the Anthropic API, behind the same interface as OllamaChat.

    A job's model setting that is still an Ollama name (for example `qwen2.5:7b-instruct`) is answered by
    `default_model`; a name starting with `claude-` is used as given. Token counts are the ones the API reports.
    The key is read when the first call is made, so a missing key fails that call (which callers already handle)
    and not the whole app.
    """

    def __init__(
        self,
        api_key: str | None,
        *,
        default_model: str,
        timeout: float,
        retries: int,
        client: Any = None,
    ) -> None:
        self.api_key = api_key
        self.default_model = default_model
        self.timeout = timeout
        self.retries = retries
        self._client = client  # tests only

    def resolve_model(self, model: str) -> str:
        return model if model.startswith("claude-") else self.default_model

    def _get_client(self) -> Any:
        if self._client is None:
            if not self.api_key:
                raise LLMError("no Anthropic API key is set (LEGALLENS_ANTHROPIC_API_KEY)")
            self._client = anthropic.AsyncAnthropic(
                api_key=self.api_key, timeout=self.timeout, max_retries=self.retries
            )
        return self._client

    def _args(self, model: str, system: str, user: str, max_tokens: int, temperature: float) -> dict[str, Any]:
        # `temperature` is accepted for the shared interface but not sent: the current Anthropic SDK has no such
        # argument, and a real call with it raises TypeError (found by the CN-2.4 outbound test).
        return {
            "model": self.resolve_model(model),
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }

    @staticmethod
    def _failure(exc: anthropic.APIError, model: str) -> LLMError:
        """Only the error type and HTTP status: the API's message can echo part of the prompt."""
        status = getattr(exc, "status_code", None)
        where = f" HTTP {status}" if status else ""
        return LLMError(f"{type(exc).__name__}{where} calling model {model}")

    async def complete(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> LLMResult:
        args = self._args(model, system, user, max_tokens, temperature)
        client = self._get_client()
        try:
            message = await client.messages.create(**args)
        except anthropic.APIError as exc:
            raise self._failure(exc, args["model"]) from exc
        text = "".join(block.text for block in message.content if block.type == "text")
        return LLMResult(
            text=text,
            tokens_in=int(message.usage.input_tokens),
            tokens_out=int(message.usage.output_tokens),
            model=args["model"],
        )

    async def stream(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str]:
        async for item in self.stream_full(model, system, user, max_tokens=max_tokens, temperature=temperature):
            if isinstance(item, str):
                yield item

    async def stream_full(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str | LLMResult]:
        args = self._args(model, system, user, max_tokens, temperature)
        client = self._get_client()
        parts: list[str] = []
        try:
            async with client.messages.stream(**args) as stream:
                async for piece in stream.text_stream:
                    parts.append(piece)
                    yield piece
                final = await stream.get_final_message()
        except anthropic.APIError as exc:
            raise self._failure(exc, args["model"]) from exc
        yield LLMResult(
            text="".join(parts),
            tokens_in=int(final.usage.input_tokens),
            tokens_out=int(final.usage.output_tokens),
            model=args["model"],
        )

    async def ping(self) -> bool:
        """True when a key is set. It makes no call, because every call to Claude costs money (DEC-96)."""
        return bool(self.api_key)


def get_llm(settings: Settings) -> ChatModel:
    if settings.llm_provider == "claude":
        from legallens.models.spend import GuardedChat, SpendGuard, SpendLedger  # spend imports this module

        key = settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else None
        claude = ClaudeChat(
            key,
            default_model=settings.claude_model,
            timeout=settings.llm_timeout_seconds,
            retries=settings.llm_retries,
        )
        guard = SpendGuard(
            SpendLedger(settings.spend_ledger_path),
            cap_usd=settings.claude_spend_cap_usd,
            warn_ratio=settings.claude_spend_warn_ratio,
        )
        return GuardedChat(claude, guard)
    return OllamaChat(
        settings.llm_url,
        context_tokens=settings.llm_context_tokens,
        timeout=settings.llm_timeout_seconds,
        retries=settings.llm_retries,
    )


def local_status(settings: Settings) -> tuple[bool, str]:
    """(ok, detail) for /health: is Ollama up, and are the configured models pulled?

    With the Claude provider it only checks that a key is set: a health check must not cost money."""
    if settings.llm_provider == "claude":
        if settings.anthropic_api_key is None:
            return False, "Claude is selected but no API key is set (LEGALLENS_ANTHROPIC_API_KEY)"
        from legallens.models.spend import dollars, spend_summary

        spent, cap = spend_summary(settings)
        detail = f"Claude · {settings.claude_model} · {dollars(spent)} of {dollars(cap)} spent"
        return spent < cap, detail if spent < cap else f"{detail}: cap reached, no further calls"
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
