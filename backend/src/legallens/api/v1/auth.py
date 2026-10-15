"""A · Auth: password, then a 6-digit code, then a session cookie (DEC-54). Dev mode accepts any of both."""

from fastapi import APIRouter, Request, Response

from legallens import __version__
from legallens.api.deps import AppDatabase, AppSettings, CurrentUser, WriteDB
from legallens.config import Settings
from legallens.db.models import AuthSession, User
from legallens.errors import ApiError
from legallens.schemas.auth import (
    AppInfo,
    DevSessionRequest,
    LoginRequest,
    LoginResponse,
    Me,
    MeUpdate,
    MfaVerifyRequest,
    SessionInfo,
    UserOut,
)
from legallens.schemas.common import problem_responses
from legallens.services import auth as auth_service
from legallens.services.auth import COOKIE_NAME, Principal

router = APIRouter(prefix="/auth", tags=["A · Auth"])


def app_info(settings: Settings) -> AppInfo:
    return AppInfo(
        version=__version__,
        orchestrator=settings.orchestrator,
        embedder=settings.embedder,
        converter=settings.converter,
        scanner=settings.scanner,
        model_id="stub-orchestrator" if settings.orchestrator == "stub" else None,
        prompt_version="stub-0" if settings.orchestrator == "stub" else None,
    )


def build_me(user: User, expires_at: object, settings: Settings) -> Me:
    return Me(
        user=UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            licensing_states=list(user.licensing_states or []),
            created_at=user.created_at,
            last_login_at=user.last_login_at,
        ),
        session=SessionInfo(expires_at=expires_at, idle_timeout_s=settings.session_idle_minutes * 60),  # type: ignore[arg-type]
        auth_mode=settings.auth_mode,
        app=app_info(settings),
    )


def _set_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
        path="/",
        max_age=settings.session_max_hours * 3600,
    )


@router.post("/login", operation_id="login", responses=problem_responses(401, 422, 423))
def login(body: LoginRequest, response: Response, db: WriteDB, settings: AppSettings) -> LoginResponse:
    """Checks the password and starts the MFA step. The cookie it sets is not usable until the code is verified."""
    user = auth_service.find_user(db, body.email)
    auth_service.ensure_not_locked(user)
    if user is None or not auth_service.check_password(settings, user, body.password):
        if user is not None and settings.auth_mode == "real":
            auth_service.register_failure(settings, user)
            db.commit()
        raise ApiError(401, "invalid_credentials", "The email or password is not correct.")
    token, _ = auth_service.create_session(db, settings, user, mfa_verified=False)
    db.commit()
    _set_cookie(response, settings, token)
    return LoginResponse(mfa_required=True)


@router.post("/mfa/verify", operation_id="verifyMfa", responses=problem_responses(401, 422, 423))
def verify_mfa(
    body: MfaVerifyRequest, request: Request, db: WriteDB, database: AppDatabase, settings: AppSettings
) -> Me:
    pending = auth_service.resolve(database, settings, request.cookies.get(COOKIE_NAME), require_mfa=False)
    session_row = db.get(AuthSession, pending.session_id)
    user = db.get(User, pending.user.id)
    if session_row is None or user is None:
        raise ApiError(401, "session_expired", "Your session has expired. Sign in again.")
    auth_service.ensure_not_locked(user)
    if not auth_service.check_totp(settings, user, body.code):
        if settings.auth_mode == "real":
            auth_service.register_failure(settings, user)
            db.commit()
        raise ApiError(401, "invalid_code", "That code is not correct.")
    auth_service.register_success(user)
    auth_service.complete_login(db, user, session_row)
    db.commit()
    return build_me(user, session_row.expires_at, settings)


@router.post("/logout", status_code=204, operation_id="logout", responses=problem_responses(401))
def logout(me: CurrentUser, db: WriteDB, response: Response) -> Response:
    auth_service.end_session(db, me.session_id, me.user.id)
    db.commit()
    response.status_code = 204
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@router.get("/me", operation_id="getMe", responses=problem_responses(401))
def get_me(me: CurrentUser, settings: AppSettings) -> Me:
    return build_me(me.user, me.expires_at, settings)


@router.patch("/me", operation_id="updateMe", responses=problem_responses(401, 422))
def update_me(body: MeUpdate, me: CurrentUser, db: WriteDB, settings: AppSettings) -> Me:
    """The lawyer's own settings. For now: the states they are licensed in (DEC-29)."""
    user = db.get(User, me.user.id)
    if user is None:  # pragma: no cover - the session's user always exists
        raise ApiError(401, "not_authenticated", "Sign in again.")
    user.licensing_states = body.licensing_states
    db.commit()
    return build_me(user, me.expires_at, settings)


@router.post("/dev-session", operation_id="devSession", responses=problem_responses(401, 404))
def dev_session(body: DevSessionRequest, response: Response, db: WriteDB, settings: AppSettings) -> Me:
    """Dev mode only: signs in with one call (both steps), for Swagger UI and curl."""
    if settings.auth_mode != "dev" or settings.env == "prod":
        raise ApiError(404, "not_found", "Not found.")
    user = auth_service.find_user(db, body.email or settings.dev_user_email)
    if user is None:
        raise ApiError(401, "invalid_credentials", "No such user. Run `legallens seed` first.")
    token, session_row = auth_service.create_session(db, settings, user, mfa_verified=False)
    auth_service.complete_login(db, user, session_row)
    db.commit()
    _set_cookie(response, settings, token)
    return build_me(user, session_row.expires_at, settings)


__all__ = ["Principal", "router"]
