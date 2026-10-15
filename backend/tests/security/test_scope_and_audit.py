"""The matter-scope guard (DEC-53) and the hash-chained audit log (DEC-68)."""

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.db.models import Conversation, Matter, User
from legallens.db.scope import MatterScopeError, set_scope, unscoped
from legallens.ids import new_id
from legallens.services import audit


@pytest.fixture
def db(settings: Settings) -> Database:
    database = Database(settings.db_path)
    with database.write() as session:
        session.add(User(id="usr_1", email="a@x", name="A", licensing_states=[]))
        session.flush()
        for matter_id in ("mat_a", "mat_b"):
            session.add(
                Matter(
                    id=matter_id,
                    owner_user_id="usr_1",
                    name=matter_id,
                    client_name="c",
                    our_side="x",
                    profile_json={},
                    ai_consent_json={},
                )
            )
        session.flush()
        set_scope(session, "mat_a")
        session.add(Conversation(id="cnv_a", matter_id="mat_a", user_id="usr_1", title="A chat"))
    with database.write() as session:
        set_scope(session, "mat_b")
        session.add(Conversation(id="cnv_b", matter_id="mat_b", user_id="usr_1", title="B chat"))
    return database


class TestScopeGuard:
    def test_query_without_scope_is_refused(self, db: Database) -> None:
        with db.read() as session, pytest.raises(MatterScopeError):
            session.execute(select(Conversation)).all()

    def test_scoped_query_sees_only_its_matter(self, db: Database) -> None:
        for matter_id, expected in (("mat_a", ["cnv_a"]), ("mat_b", ["cnv_b"]), ("mat_a", ["cnv_a"])):
            # Fresh sessions reuse SQLAlchemy's statement cache: the matter id must never be cached with it.
            with db.read() as session:
                set_scope(session, matter_id)
                assert list(session.execute(select(Conversation.id)).scalars()) == expected
                assert session.get(Conversation, "cnv_b" if matter_id == "mat_a" else "cnv_a") is None

    def test_aggregate_queries_are_filtered_too(self, db: Database) -> None:
        with db.read() as session:
            set_scope(session, "mat_a")
            assert session.execute(select(func.count(Conversation.id))).scalar() == 1

    def test_writing_into_another_matter_is_refused(self, db: Database) -> None:
        with pytest.raises(MatterScopeError), db.write() as session:
            set_scope(session, "mat_a")
            session.add(Conversation(id="cnv_x", matter_id="mat_b", user_id="usr_1", title="sneaky"))

    def test_a_session_cannot_switch_matters(self, db: Database) -> None:
        with db.read() as session:
            set_scope(session, "mat_a")
            with pytest.raises(MatterScopeError):
                set_scope(session, "mat_b")

    def test_unscoped_block_is_explicit(self, db: Database) -> None:
        with db.read() as session, unscoped(session):
            assert session.execute(select(func.count(Conversation.id))).scalar() == 2


class TestAuditLog:
    def test_chain_verifies_and_detects_tampering(self, db: Database) -> None:
        with db.write() as session:
            for i in range(3):
                audit.append(
                    session,
                    action="ask",
                    entity_type="message",
                    entity_id=new_id("message"),
                    matter_id="mat_a",
                    details={"n": i},
                )
        with db.read() as session:
            assert audit.verify_chain(session) == (True, None)
        # Simulate an edit made outside the app: drop the guard trigger, change a row, then check.
        with db.write() as session:
            session.execute(text("DROP TRIGGER audit_log_no_update"))
            session.execute(text("UPDATE audit_log SET action = 'export' WHERE id = 2"))
        with db.read() as session:
            assert audit.verify_chain(session) == (False, 2)

    def test_rows_cannot_be_updated_or_deleted(self, db: Database) -> None:
        with db.write() as session:
            audit.append(session, action="login", entity_type="user", entity_id="usr_1")
        for statement in ("UPDATE audit_log SET action = 'x'", "DELETE FROM audit_log"):
            with pytest.raises(IntegrityError), db.write() as session:
                session.execute(text(statement))

    @pytest.mark.parametrize("details", [{"note": "Client says the deposit was paid"}, {"q": "what is 4.2?"}])
    def test_details_refuse_free_text(self, db: Database, details: dict[str, str]) -> None:
        with pytest.raises(audit.AuditDetailError), db.write() as session:
            audit.append(session, action="ask", entity_type="message", details=details)

    def test_details_accept_ids_counts_and_enums(self, db: Database) -> None:
        with db.write() as session:
            audit.append(
                session,
                action="upload",
                entity_type="document",
                details={
                    "kind": "pdf",
                    "size": 1024,
                    "origin": "other_party",
                    "job_id": "job_01ABC",
                    "flags": [True, None],
                },
            )
