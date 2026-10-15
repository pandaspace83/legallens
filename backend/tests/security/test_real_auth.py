"""Real sign-in (CL-3.1, DEC-54): argon2id, TOTP, lockout, the CSRF header and no dev session."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pyotp
import pytest
from fastapi.testclient import TestClient

from legallens.db.engine import Database
from legallens.db.migrate import upgrade
from legallens.db.models import User
from legallens.ids import new_id
from legallens.main import create_app
from legallens.services import auth as auth_service
from tests.conftest import EMBED_DIM, make_settings

PASSWORD = "correct horse battery staple"
HEADERS = {"X-LegalLens-Request": "1"}


@pytest.fixture
def real(tmp_path: Path) -> Iterator[tuple[TestClient, pyotp.TOTP, Any]]:
    settings = make_settings(tmp_path / "data", auth_mode="real", lockout_attempts=3, lockout_minutes=15)
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=EMBED_DIM)
    sealed, seed, _ = auth_service.new_totp(settings, "lawyer@example.com")
    database = Database(settings.db_path)
    with database.write() as db:
        db.add(
            User(
                id=new_id("user"),
                email="lawyer@example.com",
                name="Lawyer",
                password_hash=auth_service.hash_password(PASSWORD),
                totp_secret=sealed,
            )
        )
    database.dispose()
    client = TestClient(create_app(settings))
    client.__enter__()
    try:
        yield client, pyotp.TOTP(seed), settings
    finally:
        client.__exit__(None, None, None)


def login(client: TestClient, password: str = PASSWORD) -> Any:
    return client.post(
        "/api/v1/auth/login", json={"email": "lawyer@example.com", "password": password}, headers=HEADERS
    )


def test_password_then_code_signs_in(real) -> None:  # type: ignore[no-untyped-def]
    client, totp, _ = real
    assert login(client).status_code == 200
    assert client.get("/api/v1/matters").status_code == 401  # the code is still missing
    ok = client.post("/api/v1/auth/mfa/verify", json={"code": totp.now()}, headers=HEADERS)
    assert ok.status_code == 200 and ok.json()["auth_mode"] == "real"
    assert client.get("/api/v1/matters").status_code == 200


def test_wrong_password_and_wrong_code_are_refused(real) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = real
    assert login(client, "not the password").status_code == 401
    assert login(client).status_code == 200
    bad = client.post("/api/v1/auth/mfa/verify", json={"code": "000000"}, headers=HEADERS)
    assert bad.status_code == 401 and bad.json()["code"] == "invalid_code"


def test_three_wrong_passwords_lock_the_account_even_for_the_right_one(real) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = real
    for _ in range(3):
        assert login(client, "nope").status_code == 401
    locked = login(client)
    assert locked.status_code == 423 and locked.json()["code"] == "account_locked"


def test_a_write_without_the_header_is_refused_and_dev_session_is_off(real) -> None:  # type: ignore[no-untyped-def]
    client, _, _ = real
    no_header = client.post("/api/v1/auth/login", json={"email": "lawyer@example.com", "password": PASSWORD})
    assert no_header.status_code == 403 and no_header.json()["code"] == "csrf_header_missing"
    assert client.post("/api/v1/auth/dev-session", json={}, headers=HEADERS).status_code == 404


def test_the_totp_seed_is_not_stored_in_the_clear(real) -> None:  # type: ignore[no-untyped-def]
    _, totp, settings = real
    database = Database(settings.db_path)
    with database.read() as db:
        stored = db.query(User).one().totp_secret
    assert stored is not None and totp.secret.encode() not in stored
