"""Turn an existing plain database into an encrypted one (CL-3.2, `legallens db encrypt`).

A fresh encrypted file is created with the current migrations, every ordinary table is copied into it, and the
full-text index is rebuilt by the chunk triggers as the rows arrive; the vectors are copied directly. Row counts
are compared before the old file is replaced. The plain file is then deleted: leaving it would defeat the point.
"""

import os
import secrets
from pathlib import Path

from legallens.db.crypto import key_file
from legallens.db.engine import Database
from legallens.db.migrate import current_revision, head_revision, upgrade

PLAIN_HEADER = b"SQLite format 3\x00"
_SKIP = ("sqlite_", "chunks_fts", "chunks_vec", "alembic_version")


def is_plain(path: Path) -> bool:
    with path.open("rb") as handle:
        return handle.read(16) == PLAIN_HEADER


def encrypt_database(db_path: Path, embed_dim: int) -> dict[str, int]:
    """Returns the row count copied per table. Raises if the file is already encrypted or not at the head revision."""
    if not db_path.exists():
        raise FileNotFoundError(db_path)
    if not is_plain(db_path):
        raise ValueError("The database is already encrypted.")
    old_env = os.environ.get("LEGALLENS_DB_ENCRYPTION")
    os.environ["LEGALLENS_DB_ENCRYPTION"] = "off"
    try:
        plain = Database(db_path)
        try:
            if current_revision(plain) != head_revision():
                raise ValueError("Run `legallens db upgrade` first: the database is not at the current schema.")
        finally:
            plain.dispose()
    finally:
        if old_env is None:
            os.environ.pop("LEGALLENS_DB_ENCRYPTION", None)
        else:
            os.environ["LEGALLENS_DB_ENCRYPTION"] = old_env

    key_path = key_file(db_path)
    created_key = not key_path.exists()
    if created_key:
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as handle:
            handle.write(secrets.token_hex(32))
    tmp = db_path.with_name(db_path.name + ".enc-tmp")
    for suffix in ("", "-wal", "-shm"):
        Path(f"{tmp}{suffix}").unlink(missing_ok=True)
    os.environ["LEGALLENS_DB_ENCRYPTION"] = "on"
    try:
        upgrade(tmp, embed_dim=embed_dim)
        target = Database(tmp)
        counts: dict[str, int] = {}
        raw = target.write_engine.raw_connection()
        try:
            cur = raw.cursor()
            cur.execute("PRAGMA foreign_keys=OFF")
            cur.execute("ATTACH DATABASE ? AS old KEY ''", (str(db_path),))
            tables = [
                row[0]
                for row in cur.execute("SELECT name FROM old.sqlite_master WHERE type='table'").fetchall()
                if not row[0].startswith(_SKIP)
            ]
            for name in tables:
                columns = [r[1] for r in cur.execute(f'PRAGMA main.table_info("{name}")').fetchall()]
                shared = ", ".join(f'"{c}"' for c in columns)
                cur.execute(f'INSERT INTO main."{name}" ({shared}) SELECT {shared} FROM old."{name}"')
                (n_old,) = cur.execute(f'SELECT COUNT(*) FROM old."{name}"').fetchone()
                (n_new,) = cur.execute(f'SELECT COUNT(*) FROM main."{name}"').fetchone()
                if n_old != n_new:
                    raise RuntimeError(f"Copy of {name} lost rows: {n_old} became {n_new}.")
                counts[name] = n_new
            cur.execute(
                "INSERT INTO main.chunks_vec (rowid, matter_id, document_id, embedding) "
                "SELECT rowid, matter_id, document_id, embedding FROM old.chunks_vec"
            )
            raw.commit()
            cur.execute("DETACH DATABASE old")
            cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            raw.close()
            target.dispose()
    finally:
        os.environ.pop("LEGALLENS_DB_ENCRYPTION", None) if old_env is None else os.environ.__setitem__(
            "LEGALLENS_DB_ENCRYPTION", old_env
        )
    for suffix in ("-wal", "-shm"):
        Path(f"{db_path}{suffix}").unlink(missing_ok=True)
        Path(f"{tmp}{suffix}").unlink(missing_ok=True)
    os.replace(tmp, db_path)
    return counts
