"""The database file is encrypted at rest (CL-3.2, DEC-57), and an existing plain database converts."""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest

from legallens.db.convert import encrypt_database, is_plain
from legallens.db.engine import Database
from legallens.db.migrate import upgrade
from tests.conftest import EMBED_DIM, Api, make_settings, signed_in_client


@pytest.fixture
def encryption_env() -> Iterator[None]:
    old = os.environ.get("LEGALLENS_DB_ENCRYPTION")
    yield
    if old is None:
        os.environ.pop("LEGALLENS_DB_ENCRYPTION", None)
    else:
        os.environ["LEGALLENS_DB_ENCRYPTION"] = old


def test_a_new_encrypted_database_is_unreadable_without_the_key(tmp_path: Path, encryption_env: None) -> None:
    os.environ["LEGALLENS_DB_ENCRYPTION"] = "on"
    path = tmp_path / "data" / "legallens.db"
    upgrade(path, embed_dim=EMBED_DIM)
    assert not is_plain(path)
    assert b"matters" not in path.read_bytes()  # table names are not visible in the file
    import sqlite3

    with pytest.raises(sqlite3.DatabaseError):
        sqlite3.connect(path).execute("SELECT count(*) FROM sqlite_master").fetchone()
    database = Database(path)
    with database.read() as db:
        from sqlalchemy import text

        assert db.execute(text("SELECT count(*) FROM matters")).scalar() == 0
    assert (path.parent / "db.key").stat().st_mode & 0o077 == 0, "the key file is owner-only"


def test_an_existing_database_converts_and_keeps_its_documents_and_search(tmp_path: Path, encryption_env: None) -> None:
    os.environ["LEGALLENS_DB_ENCRYPTION"] = "off"
    settings = make_settings(tmp_path / "data")
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=EMBED_DIM)
    samples = tmp_path / "samples"
    samples.mkdir()
    from legallens.samples.generate import write_sample

    write_sample("smith_msa_v3.pdf", samples)
    client = signed_in_client(settings)
    try:
        api = Api(client, settings, samples)
        matter = api.create_matter()
        api.ingest(matter["id"], "smith_msa_v3.pdf")
        before = client.get(f"/api/v1/matters/{matter['id']}/documents").json()
    finally:
        client.__exit__(None, None, None)
    assert is_plain(settings.db_path)

    counts = encrypt_database(settings.db_path, EMBED_DIM)
    assert counts["documents"] == 1 and counts["chunks"] > 0
    assert not is_plain(settings.db_path)
    assert not Path(f"{settings.db_path}.enc-tmp").exists()

    os.environ.pop("LEGALLENS_DB_ENCRYPTION")  # auto: the key file now says it is encrypted
    client = signed_in_client(settings)
    try:
        after = client.get(f"/api/v1/matters/{matter['id']}/documents").json()
        assert [d["id"] for d in after["items"]] == [d["id"] for d in before["items"]]
        api = Api(client, settings, samples)
        turn = api.ask(api.new_chat(matter["id"]), "How much notice is needed to terminate for convenience?")
        assert turn.answer["citations"], "search over the converted index returns passages"
    finally:
        client.__exit__(None, None, None)


def test_files_are_sealed_and_a_backup_restores_with_the_key(tmp_path: Path, encryption_env: None) -> None:
    """CL-3.3: sealed originals, a backup without the key inside, and a restore test that passes with it."""
    from legallens.backup import create_backup, restore_backup, verify_backup
    from legallens.db.crypto import load_key
    from legallens.storage.files import MAGIC

    os.environ["LEGALLENS_DB_ENCRYPTION"] = "on"
    settings = make_settings(tmp_path / "data")
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=EMBED_DIM)
    samples = tmp_path / "samples"
    samples.mkdir()
    from legallens.samples.generate import write_sample

    write_sample("smith_msa_v3.pdf", samples)
    client = signed_in_client(settings)
    try:
        api = Api(client, settings, samples)
        matter = api.create_matter()
        [document] = api.ingest(matter["id"], "smith_msa_v3.pdf")
        stored = [p for p in settings.files_dir.rglob("*") if p.is_file()]
        assert stored and all(p.read_bytes().startswith(MAGIC) for p in stored), "originals are sealed on disk"
        served = client.get(f"/api/v1/documents/{document}/file")
        assert served.status_code == 200 and served.content.startswith(b"%PDF"), "the viewer still gets the PDF"
    finally:
        client.__exit__(None, None, None)

    key = load_key(settings.db_path, create=False)
    assert key is not None
    backup = tmp_path / "out" / "legallens.llbackup"
    manifest = create_backup(settings, backup)
    assert manifest["counts"]["documents"] == 1
    assert key.encode() not in backup.read_bytes(), "the key is not inside the backup"

    assert verify_backup(backup, key=key)[-1] == "Restore test passed."
    restored = tmp_path / "restored"
    restore_backup(backup, restored, key=key)
    assert (restored / "legallens.db").exists()
    with pytest.raises(ValueError, match="key"):
        restore_backup(backup, tmp_path / "wrong", key="0" * 64)


def test_old_backups_are_pruned_but_the_newest_stays(tmp_path: Path) -> None:
    """FR-MAT-02: backups older than 35 days are deleted."""
    import time

    from legallens.backup import prune_backups

    day = 86400
    names = {"old.llbackup": 60, "older.llbackup": 90, "recent.llbackup": 3}
    for name, age in names.items():
        path = tmp_path / name
        path.write_bytes(b"x")
        stamp = time.time() - age * day
        os.utime(path, (stamp, stamp))
    removed = {p.name for p in prune_backups(tmp_path, days=35)}
    assert removed == {"old.llbackup", "older.llbackup"}
    assert (tmp_path / "recent.llbackup").exists()
    # Only old files exist: the newest one is kept anyway.
    (tmp_path / "recent.llbackup").unlink()
    assert prune_backups(tmp_path, days=35) == []


def test_feedback_exports_as_candidate_cases(tmp_path: Path, encryption_env: None) -> None:
    import json

    from legallens.feedback_export import export_feedback

    os.environ["LEGALLENS_DB_ENCRYPTION"] = "off"
    settings = make_settings(tmp_path / "data")
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=EMBED_DIM)
    samples = tmp_path / "samples"
    samples.mkdir()
    from legallens.samples.generate import write_sample

    write_sample("smith_msa_v3.pdf", samples)
    client = signed_in_client(settings)
    try:
        api = Api(client, settings, samples)
        matter = api.create_matter()
        api.ingest(matter["id"], "smith_msa_v3.pdf")
        turn = api.ask(api.new_chat(matter["id"]), "What notice is required to terminate the agreement?")
        message_id = turn.answer["id"]
        r = client.post(
            f"/api/v1/messages/{message_id}/feedback", json={"kind": "missed_something", "note": "Schedule 2"}
        )
        assert r.status_code == 200, r.text
    finally:
        client.__exit__(None, None, None)
    target = tmp_path / "cases.jsonl"
    assert export_feedback(Database(settings.db_path), target) == 1
    case = json.loads(target.read_text().splitlines()[0])
    assert case["question"].startswith("What notice") and case["feedback"] == "missed_something"
    assert case["note"] == "Schedule 2" and case["cited"]
