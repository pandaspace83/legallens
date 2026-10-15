"""Integration Phase 1 (INTEGRATION_TODO.md): what the frontend needs that the first schema didn't store.

- messages: `searched_json` (what a turn searched, DEC-22) and `job_json` ({kind, entity_id} of the job it started)
- summaries: `conversation_id`, the chat that asked for the summary
- drafts: `date_line`, `model_id`, `prompt_version`, the claims the lawyer set aside, the sources the lawyer named,
  and the rewrite and claim-response previews awaiting acceptance (DEC-44, DEC-47)
- draft_versions: `label`, what changed in that version
- exports: `summary_id`, for the summary working copies (decision 5)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.add_column(sa.Column("job_json", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("searched_json", sa.JSON(), nullable=True))
    with op.batch_alter_table("summaries", schema=None) as batch_op:
        batch_op.add_column(sa.Column("conversation_id", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_summaries_conversation_id", "conversations", ["conversation_id"], ["id"], ondelete="SET NULL"
        )
    with op.batch_alter_table("drafts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("date_line", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("model_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("prompt_version", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("waived_claims_json", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.add_column(sa.Column("added_authorities_json", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.add_column(sa.Column("proposals_json", sa.JSON(), nullable=False, server_default="{}"))
    with op.batch_alter_table("draft_versions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("label", sa.String(), nullable=False, server_default=""))
    with op.batch_alter_table("exports", schema=None) as batch_op:
        batch_op.add_column(sa.Column("summary_id", sa.String(), nullable=True))
        batch_op.create_foreign_key("fk_exports_summary_id", "summaries", ["summary_id"], ["id"], ondelete="CASCADE")
        batch_op.create_index(batch_op.f("ix_exports_summary_id"), ["summary_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("exports", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_exports_summary_id"))
        batch_op.drop_constraint("fk_exports_summary_id", type_="foreignkey")
        batch_op.drop_column("summary_id")
    with op.batch_alter_table("draft_versions", schema=None) as batch_op:
        batch_op.drop_column("label")
    with op.batch_alter_table("drafts", schema=None) as batch_op:
        for column in (
            "proposals_json",
            "added_authorities_json",
            "waived_claims_json",
            "prompt_version",
            "model_id",
            "date_line",
        ):
            batch_op.drop_column(column)
    with op.batch_alter_table("summaries", schema=None) as batch_op:
        batch_op.drop_constraint("fk_summaries_conversation_id", type_="foreignkey")
        batch_op.drop_column("conversation_id")
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.drop_column("searched_json")
        batch_op.drop_column("job_json")
