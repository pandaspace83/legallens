"""Run Alembic from code, so `legallens db upgrade` works from any directory."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

from legallens.db.engine import Database

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def alembic_config(db_path: Path, embed_dim: int | None = None) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    cfg.attributes["db_path"] = db_path
    cfg.attributes["embed_dim"] = embed_dim
    return cfg


def upgrade(db_path: Path, revision: str = "head", embed_dim: int | None = None) -> None:
    """embed_dim sizes the vec0 column when it is first created; it must match the embedding model."""
    command.upgrade(alembic_config(db_path, embed_dim), revision)


def downgrade(db_path: Path, revision: str = "base") -> None:
    command.downgrade(alembic_config(db_path), revision)


def head_revision() -> str | None:
    return ScriptDirectory(str(MIGRATIONS_DIR)).get_current_head()


def current_revision(database: Database) -> str | None:
    with database.read_engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()
