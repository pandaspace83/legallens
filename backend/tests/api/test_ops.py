"""H · Audit, Ops · health, the worker loop (retry, stale recovery) and the CLI."""

import time
from datetime import timedelta

import pytest
from sqlalchemy import update
from typer.testing import CliRunner

from legallens.config import Settings
from legallens.db.models import Job
from legallens.db.scope import unscoped
from legallens.jobs import worker
from legallens.jobs.queue import recover_stale
from legallens.timeutil import utcnow
from tests.conftest import Api


def test_health_reports_each_component(api: Api) -> None:
    health = api.client.get("/api/v1/health").json()
    assert health["db"]["ok"] and health["fts5"]["ok"] and health["sqlite_vec"]["detail"].startswith("v")
    assert health["scanner"] == {"kind": "none", "ok": False, "detail": "uploads are not scanned"}
    assert health["worker"]["ok"] is False and health["status"] == "degraded"
    api.settings.worker_heartbeat_path.touch()
    assert api.client.get("/api/v1/health").json()["worker"]["ok"] is True


def test_health_reports_storage_and_the_engine_versions(api: Api) -> None:
    health = api.client.get("/api/v1/health").json()
    assert health["storage"]["kind"] == "disk" and "free" in health["storage"]["detail"]
    assert health["orchestrator"]["detail"] == "stub-orchestrator · prompt stub-0"


def test_licensing_states_are_saved_on_the_user(api: Api) -> None:
    mine = api.client.patch("/api/v1/auth/me", json={"licensing_states": ["ny", "CA", "ca"]})
    assert mine.status_code == 200 and mine.json()["user"]["licensing_states"] == ["CA", "NY"]
    assert api.client.get("/api/v1/auth/me").json()["user"]["licensing_states"] == ["CA", "NY"]
    bad = api.client.patch("/api/v1/auth/me", json={"licensing_states": ["California"]})
    assert bad.status_code == 422


def test_audit_log_pages_filters_and_jsonl(api: Api) -> None:
    matter = api.create_matter()
    for name in ("one", "two", "three"):
        api.client.patch(f"/api/v1/matters/{matter['id']}", json={"practice_area": name})
    url = f"/api/v1/matters/{matter['id']}/audit"
    page = api.client.get(url, params={"limit": 2}).json()
    assert page["chain_valid"] and [e["action"] for e in page["items"]] == ["matter_create", "matter_update"]
    rest = api.client.get(url, params={"cursor": page["next_cursor"]}).json()
    assert [e["action"] for e in rest["items"]] == ["matter_update", "matter_update"]
    assert len(api.client.get(url, params={"action": "matter_update"}).json()["items"]) == 3
    download = api.client.get(url, params={"format": "jsonl"})
    assert download.headers["x-audit-chain-valid"] == "true" and len(download.text.strip().splitlines()) == 4
    assert all(e["details"] == {"fields": ["practice_area"]} for e in rest["items"])


def test_worker_thread_processes_jobs_and_heartbeats(api: Api) -> None:
    matter = api.create_matter()
    accepted = api.upload(matter["id"], "rivera_lease.txt").json()
    thread, stop = worker.start_in_thread(api.database, api.settings)
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if api.client.get(f"/api/v1/jobs/{accepted['job_id']}").json()["status"] == "done":
                break
            time.sleep(0.1)
    finally:
        stop.set()
        thread.join(timeout=10)
    assert api.client.get(f"/api/v1/documents/{accepted['document_id']}").json()["status"] == "ready"
    assert api.settings.worker_heartbeat_path.exists()


def test_crashing_job_is_retried_then_failed(api: Api, monkeypatch: pytest.MonkeyPatch) -> None:
    import legallens.ingestion.pipeline as pipeline

    calls = {"n": 0}

    def boom(ctx):  # type: ignore[no-untyped-def]
        calls["n"] += 1
        raise RuntimeError("parser exploded on 'client text'")

    monkeypatch.setattr(pipeline, "ingest", boom)
    monkeypatch.setattr(
        "legallens.jobs.handlers.ingest.HANDLER",
        type("H", (), {"run": staticmethod(boom), "failed": staticmethod(pipeline.on_failure)})(),
    )
    matter = api.create_matter()
    accepted = api.upload(matter["id"], "rivera_lease.txt").json()
    for _ in range(api.settings.job_max_attempts):
        api.run_jobs()
        with api.database.write() as db, unscoped(db):  # skip the retry backoff
            db.execute(update(Job).values(available_at=utcnow()))
    job = api.client.get(f"/api/v1/jobs/{accepted['job_id']}").json()
    assert calls["n"] == 3 and job["status"] == "failed" and job["attempts"] == 3
    assert job["error"]["code"] == "internal_error" and "client text" not in job["error"]["message"]
    document = api.client.get(f"/api/v1/documents/{accepted['document_id']}").json()
    assert document["status"] == "failed"


def test_stale_running_job_is_requeued(api: Api, settings: Settings) -> None:
    matter = api.create_matter()
    accepted = api.upload(matter["id"], "rivera_lease.txt").json()
    with api.database.write() as db, unscoped(db):
        db.execute(update(Job).values(status="running", attempts=1, heartbeat_at=utcnow() - timedelta(minutes=10)))
    assert recover_stale(api.database, settings) == 1
    assert api.client.get(f"/api/v1/jobs/{accepted['job_id']}").json()["status"] == "queued"
    api.run_jobs()
    assert api.client.get(f"/api/v1/jobs/{accepted['job_id']}").json()["status"] == "done"


def test_cli_end_to_end(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    from legallens.cli import app
    from legallens.config import get_settings

    for key, value in {
        "LEGALLENS_DATA_DIR": str(tmp_path / "data"),
        "LEGALLENS_SCANNER": "none",
        "LEGALLENS_CONVERTER": "fast",
        "LEGALLENS_EMBED_DIM": "64",
        "LEGALLENS_EMBEDDER": "hash",
        "LEGALLENS_RERANKER": "none",
    }.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    runner = CliRunner()
    try:
        assert runner.invoke(app, ["db", "upgrade"]).exit_code == 0
        seeded = runner.invoke(app, ["seed", "--with-documents"])
        assert seeded.exit_code == 0, seeded.output
        assert "Ingested: ran 7 job(s)." in seeded.output
        matter_id = next(
            line.split("(")[-1].rstrip(")")
            for line in seeded.output.splitlines()
            if line.startswith("Matter created: Smith")
        )
        found = runner.invoke(app, ["search", "notice to terminate", "--matter", matter_id])
        assert found.exit_code == 0 and "smith_msa_v3.pdf" in found.output and "4.2" in found.output
        assert "Audit chain is intact." in runner.invoke(app, ["audit", "verify"]).output
        assert runner.invoke(app, ["jobs", "run"]).output.strip() == "Ran 0 job(s)."
        assert runner.invoke(app, ["seed"]).output.count("Matter exists") == 3  # idempotent
    finally:
        get_settings.cache_clear()
