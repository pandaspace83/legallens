"""Engine and sessions.

Two session factories share one SQLite file in WAL mode:
- `read()` starts a deferred transaction (GET requests, the event tailer).
- `write()` starts with BEGIN IMMEDIATE, taking the write lock up front. A deferred transaction that reads
  and then writes fails at once with SQLITE_BUSY if another process committed in between; the API and the
  worker both write, so every write path takes the lock first and waits (busy_timeout) instead.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import sqlite_vec
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from legallens.db.crypto import load_key, pragma_key


def _make_engine(path: Path, begin: str, key: str | None = None) -> Engine:
    options: dict[str, Any] = {}
    if key:
        from sqlcipher3 import dbapi2

        options["module"] = dbapi2  # SQLCipher in place of the standard library's sqlite3
    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"check_same_thread": False, "timeout": 5},
        pool_pre_ping=False,
        **options,
    )

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn: sqlite3.Connection, _record: Any) -> None:
        # Let SQLAlchemy own transaction boundaries (see the "begin" hook below).
        dbapi_conn.isolation_level = None
        if key:  # the key must be the first statement on the connection
            dbapi_conn.execute(pragma_key(key))
        dbapi_conn.enable_load_extension(True)
        sqlite_vec.load(dbapi_conn)
        dbapi_conn.enable_load_extension(False)
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.close()

    @event.listens_for(engine, "begin")
    def _on_begin(conn: Any) -> None:
        conn.exec_driver_sql(f"BEGIN {begin}")

    return engine


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        key = load_key(path)
        self.encrypted = key is not None
        self.read_engine = _make_engine(path, "DEFERRED", key)
        self.write_engine = _make_engine(path, "IMMEDIATE", key)
        self._read = sessionmaker(self.read_engine, expire_on_commit=False)
        self._write = sessionmaker(self.write_engine, expire_on_commit=False)

    def read_session(self) -> Session:
        return self._read()

    def write_session(self) -> Session:
        return self._write()

    @contextmanager
    def read(self) -> Iterator[Session]:
        with self._read() as session:
            yield session

    @contextmanager
    def write(self) -> Iterator[Session]:
        """A short write transaction: commits on success, rolls back on error."""
        with self._write() as session:
            try:
                yield session
                session.commit()
            except BaseException:
                session.rollback()
                raise

    def dispose(self) -> None:
        self.read_engine.dispose()
        self.write_engine.dispose()
