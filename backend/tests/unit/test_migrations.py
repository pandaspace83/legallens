"""The migrations build exactly the schema the ORM models describe, so a model change without a migration fails
here instead of at runtime. Also checks the newest migration can be undone and reapplied."""

from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext

from legallens.db.engine import Database
from legallens.db.migrate import downgrade, head_revision, upgrade
from legallens.db.models import Base
from tests.conftest import EMBED_DIM

_VIRTUAL_PREFIXES = ("chunks_fts", "chunks_vec")


def _include(obj, name, type_, reflected, compare_to):  # type: ignore[no-untyped-def]
    return not (type_ == "table" and name is not None and name.startswith(_VIRTUAL_PREFIXES))


def _diff(path: Path) -> list:  # type: ignore[type-arg]
    database = Database(path)
    try:
        with database.read_engine.connect() as conn:
            context = MigrationContext.configure(conn, opts={"include_object": _include})
            return list(compare_metadata(context, Base.metadata))
    finally:
        database.dispose()


def test_migrations_match_the_models(template_db: Path) -> None:
    assert _diff(template_db) == []


def test_newest_migration_downgrades_and_upgrades(tmp_path: Path) -> None:
    path = tmp_path / "legallens.db"
    upgrade(path, embed_dim=EMBED_DIM)
    head = head_revision()
    assert head is not None
    previous = str(int(head) - 1).zfill(4)
    downgrade(path, previous)
    upgrade(path, embed_dim=EMBED_DIM)
    assert _diff(path) == []
