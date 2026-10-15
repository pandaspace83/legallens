"""Job handlers by kind. Modules are imported on first use, so the API process never loads Docling."""

import importlib
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from legallens.jobs.queue import JobContext

_MODULES = {
    "ingest": "legallens.jobs.handlers.ingest",
    "summarize": "legallens.jobs.handlers.summarize",
    "draft": "legallens.jobs.handlers.draft",
    "regenerate": "legallens.jobs.handlers.regenerate",
    "export": "legallens.jobs.handlers.export",
}


@dataclass(frozen=True)
class Handler:
    run: Callable[[JobContext], dict[str, Any] | None]
    on_failure: Callable[[JobContext, str, str], None] | None = None

    def failed(self, ctx: JobContext, code: str, message: str) -> None:
        if self.on_failure is not None:
            self.on_failure(ctx, code, message)


def get_handler(kind: str) -> Handler:
    module = importlib.import_module(_MODULES[kind])
    return module.HANDLER  # type: ignore[no-any-return]
