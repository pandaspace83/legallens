"""INT-5.1: the API serves the built frontend from its own origin."""

from pathlib import Path

from fastapi.testclient import TestClient

from legallens.config import Settings
from legallens.main import create_app


def _client(settings: Settings, folder: Path) -> TestClient:
    (folder / "assets").mkdir(parents=True)
    (folder / "index.html").write_text("<!doctype html><title>LegalLens</title>")
    (folder / "assets" / "app-abc123.js").write_text("console.log(1)")
    (folder / "favicon.svg").write_text("<svg/>")
    (folder.parent / "secret.txt").write_text("not for the web")
    settings.frontend_dir = folder
    return TestClient(create_app(settings))


def test_serves_the_app_with_spa_fallback_and_cache_headers(settings: Settings, tmp_path: Path) -> None:
    with _client(settings, tmp_path / "dist") as client:
        page = client.get("/m/abc/documents")
        assert page.status_code == 200 and "LegalLens" in page.text
        assert page.headers["cache-control"] == "no-cache"
        assert "default-src 'self'" in page.headers["content-security-policy"]
        assert page.headers["x-content-type-options"] == "nosniff"

        asset = client.get("/assets/app-abc123.js")
        assert asset.status_code == 200 and "immutable" in asset.headers["cache-control"]
        assert client.get("/favicon.svg").headers["cache-control"] == "no-cache"


def test_api_docs_and_unknown_api_paths_are_not_swallowed(settings: Settings, tmp_path: Path) -> None:
    with _client(settings, tmp_path / "dist") as client:
        assert client.get("/api/v1/health").json()["version"]
        assert client.get("/openapi.json").json()["info"]["title"] == "LegalLens API"
        missing = client.get("/api/v1/nothing-here")
        assert missing.status_code == 404 and "text/html" not in missing.headers["content-type"]


def test_cannot_read_outside_the_build_folder(settings: Settings, tmp_path: Path) -> None:
    with _client(settings, tmp_path / "dist") as client:
        response = client.get("/..%2Fsecret.txt")
        assert "not for the web" not in response.text
        assert "not for the web" not in client.get("/%2e%2e/secret.txt").text


def test_without_a_build_the_api_runs_alone(settings: Settings, tmp_path: Path) -> None:
    settings.frontend_dir = tmp_path / "missing"
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/health").status_code == 200
        assert client.get("/").status_code == 404
