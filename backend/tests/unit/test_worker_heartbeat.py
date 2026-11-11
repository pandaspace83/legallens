import os
import time
from pathlib import Path
from typing import Any

from legallens.jobs import worker
from tests.conftest import make_settings


def test_the_heartbeat_stays_fresh_while_a_long_job_runs(tmp_path: Path, monkeypatch: Any) -> None:
    settings = make_settings(tmp_path / "data")
    settings.ensure_dirs()
    beat = settings.worker_heartbeat_path
    beat.touch()
    os.utime(beat, (1, 1))  # as stale as a worker that has not touched it for a long time
    seen: list[float] = []

    def slow_job(*_: Any) -> None:
        time.sleep(0.4)
        seen.append(beat.stat().st_mtime)

    monkeypatch.setattr(worker, "execute", slow_job)
    worker.execute_with_heartbeat(None, settings, None, interval=0.05)  # type: ignore[arg-type]
    assert seen and time.time() - seen[0] < 5, "the heartbeat was touched while the job ran"


def test_the_worker_survives_a_failure_in_its_own_loop(tmp_path: Path, monkeypatch: Any) -> None:
    import threading

    settings = make_settings(tmp_path / "data", worker_poll_seconds=0.01)
    settings.ensure_dirs()
    stop = threading.Event()
    calls = {"housekeeping": 0, "claim": 0}

    def failing_housekeeping(*_: Any) -> None:
        calls["housekeeping"] += 1
        raise RuntimeError("database is locked")

    def claim(*_: Any) -> None:
        calls["claim"] += 1
        if calls["claim"] >= 2:
            stop.set()

    monkeypatch.setattr(worker, "_housekeeping", failing_housekeeping)
    monkeypatch.setattr(worker, "claim", claim)
    monkeypatch.setattr(worker, "HOUSEKEEPING_SECONDS", 3600)
    thread = threading.Thread(target=worker.run_worker, args=(None, settings, stop), daemon=True)
    thread.start()
    thread.join(timeout=5)
    # The housekeeping failure ended one turn of the loop, not the thread: it went on to claim jobs.
    assert not thread.is_alive() and calls == {"housekeeping": 1, "claim": 2}


def test_an_error_log_says_where_but_never_what(capsys: Any) -> None:
    import json
    import logging

    from legallens.logging import JsonFormatter

    record = None
    try:
        raise ValueError("CLIENT TEXT must never be logged")
    except ValueError:
        import sys

        record = logging.LogRecord("legallens.test", logging.ERROR, __file__, 1, "boom", None, sys.exc_info())
    entry = json.loads(JsonFormatter().format(record))
    assert entry["error_type"] == "ValueError"
    assert entry["frames"] and entry["frames"][-1].startswith("test_worker_heartbeat.py:")
    assert "CLIENT TEXT" not in json.dumps(entry)
