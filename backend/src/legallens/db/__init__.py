"""Database: engine, ORM models, the matter-scope guard and migrations."""

from legallens.db import scope as _scope  # noqa: F401  (registers the scope-guard session events)
from legallens.db.engine import Database

__all__ = ["Database"]
