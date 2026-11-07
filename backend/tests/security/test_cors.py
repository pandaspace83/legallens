"""CORS for the iOS app's origin only (AS-3.4, DEC-104): no other origin, no cookies, no wildcard."""

from typing import Any

from tests.security.test_bearer_auth import bearer_login
from tests.security.test_real_auth import HEADERS, real  # noqa: F401  (the `real` fixture)

APP = "capacitor://localhost"
WANTED = "authorization, x-legallens-request, idempotency-key, last-event-id, content-type"


def preflight(client: Any, origin: str, method: str = "POST", headers: str = WANTED) -> Any:
    return client.options(
        "/api/v1/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers},
    )


def test_the_app_origin_is_allowed_with_the_headers_it_needs(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    response = preflight(client, APP)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == APP
    allowed = response.headers["access-control-allow-headers"].lower()
    for name in WANTED.split(", "):
        assert name in allowed
    assert "access-control-allow-credentials" not in response.headers


def test_any_other_origin_is_refused(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    for origin in ("https://evil.example", "http://localhost:5173", "capacitor://localhost.evil.example", "null"):
        response = preflight(client, origin)
        assert response.status_code == 400, origin
        assert "access-control-allow-origin" not in response.headers
        simple = client.get("/api/v1/health", headers={"Origin": origin})
        assert "access-control-allow-origin" not in simple.headers, origin


def test_an_unlisted_header_or_method_is_refused(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    assert preflight(client, APP, headers="x-something-else").status_code == 400
    assert preflight(client, APP, method="TRACE").status_code == 400


def test_a_real_request_from_the_app_origin_gets_the_headers_and_never_credentials(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    response = bearer_login(client)
    assert response.status_code == 200
    posted = client.post(
        "/api/v1/auth/login",
        json={"email": "lawyer@example.com", "password": "x", "session_transport": "bearer"},
        headers={**HEADERS, "Origin": APP},
    )
    assert posted.status_code == 401  # an error reply carries the headers too
    assert posted.headers["access-control-allow-origin"] == APP
    assert "access-control-allow-credentials" not in posted.headers
    assert "origin" in posted.headers["vary"].lower()


def test_the_csrf_header_is_still_required_from_the_app_origin(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    response = client.post("/api/v1/auth/login", json={"email": "a@b.c", "password": "x"}, headers={"Origin": APP})
    assert response.status_code == 403
