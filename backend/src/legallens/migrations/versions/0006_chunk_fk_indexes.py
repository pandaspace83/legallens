"""Indexes on the two foreign keys that point at a chunk.

With foreign keys on, SQLite looks for child rows each time a chunk is deleted. Without these indexes that lookup
scans `chunks` and `defined_terms` once per deleted chunk, so deleting or re-ingesting a document slows down with the
size of the whole database, not of the document.

Plain CREATE INDEX, not a batch operation: a batch would rebuild `chunks`, and the FTS5 and vector triggers hang
off that table.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-11
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_chunks_parent_chunk_id", "chunks", ["parent_chunk_id"])
    op.create_index("ix_defined_terms_definition_chunk_id", "defined_terms", ["definition_chunk_id"])


def downgrade() -> None:
    op.drop_index("ix_defined_terms_definition_chunk_id", table_name="defined_terms")
    op.drop_index("ix_chunks_parent_chunk_id", table_name="chunks")
