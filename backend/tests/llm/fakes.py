"""A scripted stand-in for the local model, so orchestrator tests need no Ollama."""

from collections.abc import AsyncIterator, Callable

from legallens.models.llm import LLMError, LLMResult


class FakeChat:
    """Answers from a function of (model, system, user). Records every call so tests can assert what was sent."""

    def __init__(self, reply: str | Callable[[str, str, str], str] = "ok", *, fail: Exception | None = None) -> None:
        self.reply = reply
        self.fail = fail
        self.calls: list[dict[str, str]] = []

    def _text(self, model: str, system: str, user: str) -> str:
        self.calls.append({"model": model, "system": system, "user": user})
        if self.fail:
            raise self.fail
        return self.reply(model, system, user) if callable(self.reply) else self.reply

    async def complete(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> LLMResult:
        text = self._text(model, system, user)
        return LLMResult(text=text, tokens_in=len((system + user).split()), tokens_out=len(text.split()), model=model)

    async def stream(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str]:
        for word in self._text(model, system, user).split(" "):
            yield word + " "

    async def stream_full(
        self, model: str, system: str, user: str, *, max_tokens: int = 1024, temperature: float = 0.0
    ) -> AsyncIterator[str | LLMResult]:
        text = self._text(model, system, user)
        words = text.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
        yield LLMResult(text=text, tokens_in=len((system + user).split()), tokens_out=len(text.split()), model=model)

    async def ping(self) -> bool:
        return self.fail is None


__all__ = ["FakeChat", "LLMError"]
