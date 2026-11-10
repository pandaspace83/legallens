"""The lawyer's own permission to send text to a third-party AI (AS-3.5).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("ai_consent_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("ai_consent_version", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("ai_consent_version")
        batch.drop_column("ai_consent_at")
