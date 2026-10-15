"""Orchestration: the interface every orchestrator implements, and the factory that picks one."""

from legallens.config import Settings
from legallens.models.llm import get_llm
from legallens.orchestrator.base import Orchestrator


def get_orchestrator(settings: Settings) -> Orchestrator:
    if settings.orchestrator == "local":
        from legallens.orchestrator.local import LocalOrchestrator

        return LocalOrchestrator(settings, get_llm(settings))

    from legallens.orchestrator.stub import StubOrchestrator

    return StubOrchestrator(token_delay_ms=settings.stub_token_delay_ms)
