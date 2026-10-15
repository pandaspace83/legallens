"""Embeddings plan (EMBEDDINGS_TODO.md, D7): record which embedding model built the vector index.

`index_meta` is a small key/value table. The key `embedding` holds the signature of the model that wrote
`chunks_vec`, so a search can refuse the dense leg (and /health can warn) when the model changed and the
index was not rebuilt.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "index_meta",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.String(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("index_meta")
