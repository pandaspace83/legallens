"""Sessions and sign-in (DEC-54).

A random token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 is stored; idle timeout and absolute
expiry; the MFA step as a separate flag on the session.
Real mode (LEGALLENS_AUTH_MODE=real): argon2id passwords, TOTP codes (RFC 6238, one step of drift), and a lockout
after repeated failures. Dev mode: any password and any 6-digit code are accepted for a known email.
The contract is identical in both modes.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.db.models import AuthSession, User
from legallens.errors import ApiError
from legallens.services import audit
from legallens.timeutil import utcnow

COOKIE_NAME = "ll_session"
TOUCH_INTERVAL = timedelta(seconds=60)


@dataclass(frozen=True)
class Principal:
    user: User
    session_id: str
    expires_at: datetime
    mfa_verified: bool


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def find_user(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(func.lower(User.email) == email.strip().lower())).scalar_one_or_none()


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    """Verified against when the email is unknown, so a wrong email and a wrong password take as long."""
    from argon2 import PasswordHasher

    return PasswordHasher().hash("not-a-real-password")


def hash_password(password: str) -> str:
    from argon2 import PasswordHasher

    return PasswordHasher().hash(password)


def _verify_password(stored: str, password: str) -> bool:
    from argon2 import PasswordHasher
    from argon2.exceptions import InvalidHashError, VerificationError

    try:
        return PasswordHasher().verify(stored, password)
    except (VerificationError, InvalidHashError):
        return False


def locked_until(user: User | None) -> datetime | None:
    if user is not None and user.locked_until is not None and user.locked_until > utcnow():
        return user.locked_until
    return None


def ensure_not_locked(user: User | None) -> None:
    until = locked_until(user)
    if until is not None:
        minutes = max(1, int((until - utcnow()).total_seconds() // 60) + 1)
        raise ApiError(
            423,
            "account_locked",
            f"Too many wrong attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        )


def register_failure(settings: Settings, user: User) -> None:
    user.failed_logins = (user.failed_logins or 0) + 1
    if user.failed_logins >= settings.lockout_attempts:
        user.locked_until = utcnow() + timedelta(minutes=settings.lockout_minutes)
        user.failed_logins = 0


def register_success(user: User) -> None:
    user.failed_logins = 0
    user.locked_until = None


def check_password(settings: Settings, user: User | None, password: str) -> bool:
    if settings.auth_mode == "dev":
        return user is not None and bool(password)
    stored = user.password_hash if user is not None and user.password_hash else None
    ok = _verify_password(stored or _dummy_hash(), password)
    return ok and stored is not None


def check_totp(settings: Settings, user: User, code: str) -> bool:
    if settings.auth_mode == "dev":
        return len(code) == 6 and code.isdigit()
    if not user.totp_secret:
        return False
    import pyotp

    from legallens import secretbox

    seed = secretbox.unseal(settings, user.totp_secret)
    if not seed or len(code) != 6 or not code.isdigit():
        return False
    return bool(pyotp.TOTP(seed).verify(code, valid_window=1))


def new_totp(settings: Settings, email: str) -> tuple[bytes, str, str]:
    """(sealed seed to store, base32 seed to show once, otpauth:// URI for an authenticator app)."""
    import pyotp

    from legallens import secretbox

    seed = pyotp.random_base32()
    uri = pyotp.TOTP(seed).provisioning_uri(name=email, issuer_name="LegalLens")
    return secretbox.seal(settings, seed), seed, uri


def create_session(db: Session, settings: Settings, user: User, *, mfa_verified: bool) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    row = AuthSession(
        id=hash_token(token),
        user_id=user.id,
        mfa_verified=mfa_verified,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_max_hours),
    )
    db.add(row)
    return token, row


def complete_login(db: Session, user: User, session_row: AuthSession) -> None:
    session_row.mfa_verified = True
    user.last_login_at = utcnow()
    audit.append(db, action="login", entity_type="user", entity_id=user.id, user_id=user.id)


def end_session(db: Session, session_id: str, user_id: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.id == session_id))
    audit.append(db, action="logout", entity_type="user", entity_id=user_id, user_id=user_id)


def resolve(database: Database, settings: Settings, token: str | None, *, require_mfa: bool = True) -> Principal:
    """Looks up the session on its own short connections, never the request's transaction."""
    if not token:
        raise ApiError(401, "not_authenticated", "Sign in to continue.")
    session_id = hash_token(token)
    now = utcnow()
    with database.read() as db:
        row = db.get(AuthSession, session_id)
        user = db.get(User, row.user_id) if row else None
    if row is None or user is None:
        raise ApiError(401, "not_authenticated", "Sign in to continue.")
    idle_deadline = row.last_seen_at + timedelta(minutes=settings.session_idle_minutes)
    if now >= row.expires_at or now >= idle_deadline:
        with database.write() as db:
            db.execute(delete(AuthSession).where(AuthSession.id == session_id))
        raise ApiError(401, "session_expired", "Your session has expired. Sign in again.")
    if require_mfa and not row.mfa_verified:
        raise ApiError(401, "mfa_required", "Enter the 6-digit code to finish signing in.")
    if now - row.last_seen_at >= TOUCH_INTERVAL:
        with database.write() as db:
            fresh = db.get(AuthSession, session_id)
            if fresh is not None:
                fresh.last_seen_at = now
    return Principal(user=user, session_id=session_id, expires_at=row.expires_at, mfa_verified=row.mfa_verified)


def purge_expired(db: Session) -> int:
    result = db.execute(delete(AuthSession).where(AuthSession.expires_at < utcnow()))
    return int(getattr(result, "rowcount", 0) or 0)
