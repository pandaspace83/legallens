"""The signed-in lawyer's permission to send text to Anthropic (AS-3.5, App Store guideline 5.1.2).

Separate from the client's consent record on a matter (DEC-60): this is the user's own agreement, once per account,
to the "Where your data goes" wording. It matters only while `llm_provider` is "claude"; with the local model nothing
leaves the machine and nothing is asked. Bump CURRENT_VERSION when the wording changes materially, and everyone is
asked again.
"""

from legallens.config import Settings
from legallens.db.models import User
from legallens.errors import ApiError

CURRENT_VERSION = "1"


def required(settings: Settings, user: User) -> bool:
    return settings.llm_provider == "claude" and user.ai_consent_version != CURRENT_VERSION


def ensure(settings: Settings, user: User) -> None:
    """Called before anything that would send text to the AI. Refuses with 403 until the lawyer has agreed."""
    if required(settings, user):
        raise ApiError(
            403,
            "ai_consent_required",
            "Read where your data goes and agree before LegalLens sends anything to Anthropic's Claude.",
        )
