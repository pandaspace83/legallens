"""One log file per failure, named after the error (WORKFLOWS_TODO W7).

<data_dir>/logs/errors/<ErrorName>_<UTC timestamp>.log, outside the source tree and any synced folder.
A file records where it failed (stage, run, matter, model) and the error's own class, message and traceback.
It never records the question, the chat history, passages or model output: client text must not reach logs.
Only LLMError's message is kept (it is built without prompt text); for any other error the log holds the class
and the stack frames, because an arbitrary exception message can quote the data it choked on.
"""

import traceback
from datetime import UTC, datetime
from pathlib import Path

from legallens.config import Settings
from legallens.models.llm import LLMError

MAX_MESSAGE = 300


def log_failure(
    settings: Settings,
    error: BaseException,
    *,
    stage: str,
    run_id: str | None = None,
    matter_id: str | None = None,
    model: str | None = None,
) -> Path:
    """Write the failure to its own file and return the path. Never raises: logging must not hide the error."""
    now = datetime.now(UTC)
    name = type(error).__name__
    folder = settings.error_log_dir
    path = folder / f"{name}_{now.strftime('%Y%m%dT%H%M%S%fZ')}.log"
    message = " ".join(str(error).split())[:MAX_MESSAGE] if isinstance(error, LLMError) else "(withheld)"
    lines = [
        f"time:    {now.isoformat()}",
        f"error:   {name}",
        f"stage:   {stage}",
        f"run:     {run_id or '-'}",
        f"matter:  {matter_id or '-'}",
        f"model:   {model or '-'}",
        f"message: {message}",
        "",
        "Traceback (most recent call last):\n" + "".join(traceback.format_tb(error.__traceback__)),
    ]
    try:
        folder.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines), encoding="utf-8")
    except OSError:
        pass
    return path
