"""A · Auth."""

from typing import Literal

from pydantic import Field, field_validator

from legallens.schemas.common import RequestModel, ResponseModel, Timestamp


class LoginRequest(RequestModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class LoginResponse(ResponseModel):
    mfa_required: bool = True


class MfaVerifyRequest(RequestModel):
    code: str = Field(pattern=r"^\d{6}$")


class DevSessionRequest(RequestModel):
    email: str | None = None


class MeUpdate(RequestModel):
    """PATCH /auth/me: what the lawyer may change about themselves (DEC-29)."""

    licensing_states: list[str] = Field(max_length=60)

    @field_validator("licensing_states")
    @classmethod
    def _states(cls, value: list[str]) -> list[str]:
        codes = [v.strip().upper() for v in value]
        if any(len(c) != 2 or not c.isalpha() for c in codes):
            raise ValueError("Use two-letter state codes, e.g. CA.")
        return sorted(set(codes))


class UserOut(ResponseModel):
    id: str
    email: str
    name: str
    licensing_states: list[str]
    created_at: Timestamp
    last_login_at: Timestamp | None = None


class SessionInfo(ResponseModel):
    expires_at: Timestamp
    idle_timeout_s: int


class AppInfo(ResponseModel):
    version: str
    orchestrator: str
    embedder: str
    converter: str
    scanner: str
    model_id: str | None = None
    prompt_version: str | None = None


class Me(ResponseModel):
    user: UserOut
    session: SessionInfo
    auth_mode: Literal["dev", "real"]
    app: AppInfo
