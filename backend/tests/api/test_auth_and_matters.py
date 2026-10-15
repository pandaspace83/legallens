"""A · Auth and B · Matters."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import update

from legallens.config import Settings
from legallens.db.models import AuthSession
from legallens.main import create_app
from legallens.samples.seed import ensure_user
from legallens.timeutil import utcnow
from tests.conftest import Api, make_settings


class TestAuth:
    def test_two_step_sign_in_then_me_then_logout(self, settings: Settings) -> None:
        app = create_app(settings)
        with TestClient(app) as client:
            ensure_user(app.state.database, settings)
            assert client.get("/api/v1/auth/me").json()["code"] == "not_authenticated"
            bad = client.post("/api/v1/auth/login", json={"email": "nobody@x", "password": "pw"})
            assert (bad.status_code, bad.json()["code"]) == (401, "invalid_credentials")

            login = client.post("/api/v1/auth/login", json={"email": settings.dev_user_email, "password": "anything"})
            assert login.json() == {"mfa_required": True}
            cookie = login.headers["set-cookie"].lower()
            assert "httponly" in cookie and "samesite=strict" in cookie
            assert client.get("/api/v1/matters").json()["code"] == "mfa_required"
            assert client.post("/api/v1/auth/mfa/verify", json={"code": "12ab56"}).status_code == 422

            me = client.post("/api/v1/auth/mfa/verify", json={"code": "123456"}).json()
            assert me["user"]["email"] == settings.dev_user_email
            assert me["auth_mode"] == "dev" and me["session"]["idle_timeout_s"] == 1800
            assert client.get("/api/v1/auth/me").status_code == 200

            assert client.post("/api/v1/auth/logout").status_code == 204
            assert client.get("/api/v1/auth/me").status_code == 401

    def test_idle_timeout_ends_the_session(self, api: Api) -> None:
        with api.database.write() as db:
            db.execute(update(AuthSession).values(last_seen_at=utcnow() - timedelta(minutes=31)))
        response = api.client.get("/api/v1/auth/me")
        assert (response.status_code, response.json()["code"]) == (401, "session_expired")

    def test_dev_session_is_unavailable_in_prod(self, tmp_path, template_db) -> None:  # type: ignore[no-untyped-def]
        import shutil

        settings = make_settings(tmp_path / "data", env="prod")
        settings.ensure_dirs()
        shutil.copy(template_db, settings.db_path)
        with TestClient(create_app(settings)) as client:
            assert client.post("/api/v1/auth/dev-session", json={}).status_code == 404

    def test_errors_are_problem_json(self, api: Api) -> None:
        response = api.client.post("/api/v1/matters", json={"name": ""})
        assert response.status_code == 422
        assert response.headers["content-type"] == "application/problem+json"
        body = response.json()
        assert body["code"] == "validation_error" and body["request_id"] and body["errors"]
        assert response.headers["x-request-id"] == body["request_id"]


class TestMatters:
    def test_create_get_edit_and_list(self, api: Api) -> None:
        matter = api.create_matter(
            court="Superior Court of California, County of San Francisco",
            profile={
                "parties": [
                    {
                        "name": "Acme Corp",
                        "role": "opposing",
                        "represented": True,
                        "counsel": {"name": "Dana Whitfield", "firm": "Whitfield & Grant LLP"},
                    }
                ]
            },
            ai_consent={"status": "given", "told_tool": True, "told_data": True, "told_risks": True},
        )
        assert matter["status"] == "open" and matter["counts"] == {"documents": 0, "conversations": 0}
        assert matter["profile"]["parties"][0]["counsel"]["name"] == "Dana Whitfield"

        edited = api.client.patch(f"/api/v1/matters/{matter['id']}", json={"practice_area": "Commercial"}).json()
        assert edited["practice_area"] == "Commercial" and edited["court"] == matter["court"]

        api.create_matter("Rivera lease dispute")
        listed = api.client.get("/api/v1/matters").json()["items"]
        assert [m["name"] for m in listed] == ["Rivera lease dispute", "Smith v. Acme Corp"]  # most recent first

        page = api.client.get("/api/v1/matters?limit=1").json()
        rest = api.client.get(f"/api/v1/matters?limit=1&cursor={page['next_cursor']}").json()
        assert [m["name"] for m in page["items"] + rest["items"]] == [m["name"] for m in listed]

    def test_closed_matter_is_read_only(self, api: Api) -> None:
        matter = api.create_matter()
        closed = api.client.post(f"/api/v1/matters/{matter['id']}/close").json()
        assert closed["status"] == "closed" and closed["closed_at"]
        assert api.client.post(f"/api/v1/matters/{matter['id']}/close").status_code == 200  # no-op
        for response in (
            api.client.patch(f"/api/v1/matters/{matter['id']}", json={"name": "x"}),
            api.client.post(f"/api/v1/matters/{matter['id']}/conversations", json={}),
            api.upload(matter["id"], "rivera_lease.txt"),
        ):
            assert (response.status_code, response.json()["code"]) == (409, "matter_closed")
        assert api.client.get(f"/api/v1/matters/{matter['id']}").status_code == 200
        assert api.client.get("/api/v1/matters?status=open").json()["items"] == []

    def test_missing_and_foreign_matters(self, api: Api, other_api: Api) -> None:
        assert api.client.get("/api/v1/matters/mat_missing").json()["code"] == "not_found"
        theirs = other_api.create_matter("Their matter")
        response = api.client.get(f"/api/v1/matters/{theirs['id']}")
        assert (response.status_code, response.json()["code"]) == (403, "forbidden_matter")
        assert [m["name"] for m in api.client.get("/api/v1/matters").json()["items"]] == []

    def test_delete_needs_the_exact_name_and_removes_everything(self, api: Api) -> None:
        matter = api.create_matter()
        [document_id] = api.ingest(matter["id"], "rivera_lease.txt")
        api.ask(api.new_chat(matter["id"]), "When is rent due?")
        stored = api.settings.files_dir / matter["id"]
        assert any(stored.iterdir())

        wrong = api.client.delete(f"/api/v1/matters/{matter['id']}", params={"confirm": "smith v. acme corp"})
        assert (wrong.status_code, wrong.json()["code"]) == (422, "confirmation_mismatch")
        assert (
            api.client.delete(f"/api/v1/matters/{matter['id']}", params={"confirm": matter["name"]}).status_code == 204
        )

        assert api.client.get(f"/api/v1/matters/{matter['id']}").status_code == 404
        assert api.client.get(f"/api/v1/documents/{document_id}").status_code == 404
        assert not stored.exists()
        with api.database.read() as db:
            from sqlalchemy import text

            for table in ("documents", "chunks", "pages", "messages", "conversations", "message_citations"):
                assert db.execute(text(f"SELECT count(*) FROM {table}")).scalar() == 0, table
            assert db.execute(text("SELECT count(*) FROM chunks_fts WHERE chunks_fts MATCH 'rent'")).scalar() == 0
            assert db.execute(text("SELECT count(*) FROM chunks_vec_rowids")).scalar() == 0
            actions = [r[0] for r in db.execute(text("SELECT action FROM audit_log WHERE entity_type = 'matter'"))]
            assert actions[-1] == "delete"
