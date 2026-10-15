"""Alembic environment. Uses the app's write engine, so sqlite-vec is loaded and the pragmas are set."""

from typing import Any

from alembic import context

from legallens.config import get_settings
from legallens.db.engine import Database
from legallens.db.models import Base

# FTS5 and vec0 create shadow tables; Alembic must not try to manage them.
_VIRTUAL_PREFIXES = ("chunks_fts", "chunks_vec")


def _include_object(obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any) -> bool:
    return not (type_ == "table" and name is not None and name.startswith(_VIRTUAL_PREFIXES))


def run_migrations_online() -> None:
    db_path = context.config.attributes.get("db_path") or get_settings().db_path
    database = Database(db_path)
    try:
        with database.write_engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=Base.metadata,
                include_object=_include_object,
                render_as_batch=True,
            )
            with context.begin_transaction():
                context.run_migrations()
            connection.commit()
    finally:
        database.dispose()


run_migrations_online()
