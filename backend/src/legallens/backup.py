"""Backups with a tested restore (DEC-61, CL-3.3).

A backup is one zip with a consistent snapshot of the encrypted database, the sealed files and a manifest of
SHA-256 hashes. It never contains the key: the key is held by the lawyer, apart from the backup. Nothing leaves the
machine by itself; the file is written where the owner points it.
"""

import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from sqlalchemy import text

from legallens.config import Settings
from legallens.db.crypto import load_key
from legallens.db.engine import Database
from legallens.db.migrate import current_revision, head_revision
from legallens.timeutil import utcnow

MANIFEST = "manifest.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _counts(database: Database) -> dict[str, int]:
    with database.read() as db:
        return {
            name: int(db.execute(text(f'SELECT COUNT(*) FROM "{name}"')).scalar_one())
            for name in ("matters", "documents", "chunks", "messages", "audit_log")
        }


def create_backup(settings: Settings, target: Path) -> dict[str, Any]:
    key = load_key(settings.db_path, create=False)
    if key is None:
        raise ValueError("The database is not encrypted. Run `legallens db encrypt` before taking backups.")
    target.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="backup-", dir=settings.tmp_dir if settings.tmp_dir.exists() else None))
    try:
        snapshot = work / "legallens.db"
        database = Database(settings.db_path)
        try:
            # With the write lock held and the WAL folded into the file, the file is a consistent snapshot of
            # the encrypted database as it is on disk: copying it needs no key and keeps the encryption.
            raw = database.write_engine.raw_connection()
            try:
                cur = raw.cursor()
                cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                cur.execute("BEGIN IMMEDIATE")
                shutil.copyfile(settings.db_path, snapshot)
                cur.execute("ROLLBACK")
            finally:
                raw.close()
            counts = _counts(database)
        finally:
            database.dispose()
        members: dict[str, str] = {"legallens.db": _sha256(snapshot)}
        total = snapshot.stat().st_size
        partial = target.with_suffix(target.suffix + ".partial")
        with zipfile.ZipFile(partial, "w", zipfile.ZIP_STORED) as zf:
            zf.write(snapshot, "legallens.db")
            if settings.files_dir.exists():
                for path in sorted(settings.files_dir.rglob("*")):
                    if path.is_file():
                        name = f"files/{path.relative_to(settings.files_dir).as_posix()}"
                        zf.write(path, name)
                        members[name] = _sha256(path)
                        total += path.stat().st_size
            manifest = {
                "format": 1,
                "created_at": utcnow().isoformat(),
                "revision": head_revision(),
                "counts": counts,
                "members": members,
                "files": len(members),
                "bytes": total,
            }
            zf.writestr(MANIFEST, json.dumps(manifest, indent=2))
        os.replace(partial, target)
        target.chmod(0o600)
        return manifest
    finally:
        shutil.rmtree(work, ignore_errors=True)


def restore_backup(path: Path, to: Path, *, key: str | None = None) -> list[str]:
    """Unpacks into an empty folder and checks it opens with the key. Returns what was checked."""
    if to.exists() and any(to.iterdir()):
        raise ValueError(f"{to} is not empty. Restore into a new folder.")
    to.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    with zipfile.ZipFile(path) as zf:
        manifest = json.loads(zf.read(MANIFEST))
        for name, expected in manifest["members"].items():
            destination = (to / name).resolve()
            if not destination.is_relative_to(to.resolve()):
                raise ValueError(f"Unsafe path in the backup: {name}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as source, destination.open("wb") as out:
                shutil.copyfileobj(source, out)
            if _sha256(destination) != expected:
                raise ValueError(f"{name} does not match its hash: the backup is damaged.")
    lines.append(f"{len(manifest['members'])} files match their hashes.")
    db_path = to / "legallens.db"
    if key is not None:
        (to / "db.key").write_text(key)
        (to / "db.key").chmod(0o600)
    elif "LEGALLENS_DB_KEY" not in os.environ:
        raise ValueError("A key is needed to open the restored database: pass --key or set LEGALLENS_DB_KEY.")
    old = os.environ.get("LEGALLENS_DB_ENCRYPTION")
    os.environ["LEGALLENS_DB_ENCRYPTION"] = "on"
    try:
        database = Database(db_path)
        try:
            if current_revision(database) != manifest["revision"]:
                raise ValueError("The restored database is not at the backup's schema revision.")
            counts = _counts(database)
        finally:
            database.dispose()
    except Exception as exc:
        if "not a database" in str(exc).lower():
            raise ValueError("The key does not open this backup.") from exc
        raise
    finally:
        if old is None:
            os.environ.pop("LEGALLENS_DB_ENCRYPTION", None)
        else:
            os.environ["LEGALLENS_DB_ENCRYPTION"] = old
    if counts != manifest["counts"]:
        raise ValueError(f"Row counts differ from the backup's manifest: {counts} vs {manifest['counts']}.")
    lines.append("Schema revision and row counts match: " + ", ".join(f"{k} {v}" for k, v in counts.items()) + ".")
    return lines


def verify_backup(path: Path, *, key: str | None = None) -> list[str]:
    """A restore into a throwaway folder, then removed."""
    use = key
    if use is None:
        from legallens.config import get_settings

        use = load_key(get_settings().db_path, create=False)
    work = Path(tempfile.mkdtemp(prefix="restore-test-"))
    try:
        return [*restore_backup(path, work / "data", key=use), "Restore test passed."]
    finally:
        shutil.rmtree(work, ignore_errors=True)


RETENTION_DAYS = 35  # FR-MAT-02: a deleted matter is gone from every backup within 35 days


def backup_name(now: Any = None) -> str:
    stamp = (now or utcnow()).strftime("%Y%m%d-%H%M%S")
    return f"legallens-{stamp}.llbackup"


def prune_backups(folder: Path, *, days: int = RETENTION_DAYS, now: Any = None) -> list[Path]:
    """Deletes `*.llbackup` files older than `days`, and returns them. The newest backup is always kept, so a
    folder is never left empty by pruning alone."""
    from datetime import datetime, timedelta

    current = now or utcnow()
    files = sorted(folder.glob("*.llbackup"), key=lambda p: p.stat().st_mtime)
    removed: list[Path] = []
    cutoff = current - timedelta(days=days)
    for path in files[:-1]:
        modified = datetime.fromtimestamp(path.stat().st_mtime, tz=current.tzinfo)
        if modified < cutoff:
            path.unlink()
            removed.append(path)
    return removed
