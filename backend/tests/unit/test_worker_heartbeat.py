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
