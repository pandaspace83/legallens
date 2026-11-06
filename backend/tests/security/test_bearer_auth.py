"""Bearer sessions for the iOS app (AS-3.2, DEC-104): the same session rules as the cookie, a different carrier."""

from typing import Any

import pytest

from tests.security.test_real_auth import HEADERS, PASSWORD, real  # noqa: F401  (the `real` fixture)

EMAIL = "lawyer@example.com"


def bearer_login(client: Any, password: str = PASSWORD) -> Any:
    return client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": password, "session_transport": "bearer"},
        headers=HEADERS,
    )


def auth(token: str) -> dict[str, str]:
    return {**HEADERS, "Authorization": f"Bearer {token}"}


def test_a_bearer_login_returns_a_token_and_sets_no_cookie(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    response = bearer_login(client)
    assert response.status_code == 200
    body = response.json()
    assert body["mfa_required"] is True and len(body["token"]) >= 40
    assert "set-cookie" not in response.headers and client.cookies.get("ll_session") is None


def test_a_cookie_login_never_puts_the_token_in_the_body(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    response = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD}, headers=HEADERS)
    assert response.status_code == 200 and "token" not in response.json()
    assert client.cookies.get("ll_session")


def test_the_token_does_nothing_until_the_code_is_verified(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, totp, _ = real
    token = bearer_login(client).json()["token"]
    before = client.get("/api/v1/matters", headers=auth(token))
    assert before.status_code == 401 and before.json()["code"] == "mfa_required"
    ok = client.post("/api/v1/auth/mfa/verify", json={"code": totp.now()}, headers=auth(token))
    assert ok.status_code == 200
    assert client.get("/api/v1/matters", headers=auth(token)).status_code == 200


def test_a_wrong_code_is_refused_with_a_bearer_token(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    token = bearer_login(client).json()["token"]
    bad = client.post("/api/v1/auth/mfa/verify", json={"code": "000000"}, headers=auth(token))
    assert bad.status_code == 401 and bad.json()["code"] == "invalid_code"


def test_the_header_is_the_only_credential_when_present(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, totp, _ = real
    client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD}, headers=HEADERS)
    client.post("/api/v1/auth/mfa/verify", json={"code": totp.now()}, headers=HEADERS)
    assert client.get("/api/v1/matters").status_code == 200  # the cookie alone is good
    assert client.get("/api/v1/matters", headers={"Authorization": "Bearer not-a-token"}).status_code == 401
    assert client.get("/api/v1/matters", headers={"Authorization": "Basic abc"}).status_code == 401
    assert client.get("/api/v1/matters", headers={"Authorization": "Bearer "}).status_code == 401


def test_a_token_in_the_url_is_ignored(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, totp, _ = real
    token = bearer_login(client).json()["token"]
    client.post("/api/v1/auth/mfa/verify", json={"code": totp.now()}, headers=auth(token))
    assert client.get(f"/api/v1/matters?token={token}").status_code == 401
    assert client.get("/api/v1/matters", headers=auth(token)).status_code == 200


def test_sign_out_ends_a_bearer_session(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, totp, _ = real
    token = bearer_login(client).json()["token"]
    client.post("/api/v1/auth/mfa/verify", json={"code": totp.now()}, headers=auth(token))
    assert client.post("/api/v1/auth/logout", headers=auth(token)).status_code == 204
    assert client.get("/api/v1/matters", headers=auth(token)).status_code == 401


def test_a_bearer_session_obeys_the_idle_and_absolute_limits(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    from datetime import timedelta

    from legallens.db.engine import Database
    from legallens.db.models import AuthSession
    from legallens.timeutil import utcnow

    client, totp, settings = real
    token = bearer_login(client).json()["token"]
    client.post("/api/v1/auth/mfa/verify", json={"code": totp.now()}, headers=auth(token))
    database = Database(settings.db_path)
    with database.write() as db:
        row = db.query(AuthSession).one()
        row.last_seen_at = utcnow() - timedelta(minutes=settings.session_idle_minutes + 1)
    database.dispose()
    expired = client.get("/api/v1/matters", headers=auth(token))
    assert expired.status_code == 401 and expired.json()["code"] == "session_expired"


def test_the_csrf_header_is_still_required_on_a_bearer_write(real) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    response = client.post(
        "/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD, "session_transport": "bearer"}
    )
    assert response.status_code == 403 and response.json()["code"] == "csrf_header_missing"


@pytest.mark.parametrize("password", ["wrong"])
def test_a_wrong_password_gives_no_token(real, password: str) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    client, _, _ = real
    response = bearer_login(client, password)
    assert response.status_code == 401 and "token" not in response.json()
