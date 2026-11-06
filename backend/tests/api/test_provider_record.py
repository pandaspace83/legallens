"""CN-2.4: the active AI provider is shown by the API and recorded in the matter's AI-consent record."""

from pathlib import Path

from tests.conftest import Api, make_settings, signed_in_client


def test_local_is_reported_and_stamped_on_consent(api: Api) -> None:
    assert api.client.get("/api/v1/auth/me").json()["app"]["llm_provider"] == "local"
    matter = api.create_matter(ai_consent={"status": "given"})
    assert matter["ai_consent"]["provider"] == "local"


def test_claude_is_stamped_and_a_client_cannot_choose_it(tmp_path: Path, template_db: Path) -> None:
    import shutil

    settings = make_settings(tmp_path / "data", llm_provider="claude", anthropic_api_key="sk-ant-test-not-real")
    settings.ensure_dirs()
    shutil.copy(template_db, settings.db_path)
    client = signed_in_client(settings)
    try:
        assert client.get("/api/v1/auth/me").json()["app"]["llm_provider"] == "claude"
        body = {
            "name": "M",
            "client_name": "C",
            "our_side": "buyer",
            "ai_consent": {"status": "given", "provider": "local"},
        }
        created = client.post("/api/v1/matters", json=body).json()
        assert created["ai_consent"]["provider"] == "claude"  # the server's value, not the request's
        updated = client.patch(
            f"/api/v1/matters/{created['id']}", json={"ai_consent": {"status": "declined", "provider": "local"}}
        )
        assert updated.json()["ai_consent"]["provider"] == "claude"
    finally:
        client.__exit__(None, None, None)
