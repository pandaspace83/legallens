"""B · Matters (DEC-30 profile, DEC-60 AI consent)."""

import datetime as dt
from typing import Literal

from pydantic import Field

from legallens.schemas.common import RequestModel, ResponseModel, Timestamp


class Counsel(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    firm: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=254)


class Party(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    role: Literal["client", "opposing", "other"]
    represented: bool = False
    counsel: Counsel | None = None


class MatterProfile(RequestModel):
    parties: list[Party] = Field(default_factory=list, max_length=50)
    court_level: Literal["federal", "state"] | None = None
    notes: str | None = Field(default=None, max_length=4000)


class AiConsent(RequestModel):
    status: Literal["not_recorded", "given", "declined"] = "not_recorded"
    recorded_on: dt.date | None = None
    told_tool: bool = False
    told_data: bool = False
    told_risks: bool = False
    notes: str | None = Field(default=None, max_length=4000)
    consent_document_id: str | None = None


class MatterCreate(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    client_name: str = Field(min_length=1, max_length=200)
    our_side: str = Field(min_length=1, max_length=60, examples=["plaintiff", "defendant", "buyer"])
    court: str | None = Field(default=None, max_length=200)
    jurisdiction: str | None = Field(default=None, max_length=200)
    practice_area: str | None = Field(default=None, max_length=200)
    profile: MatterProfile | None = None
    ai_consent: AiConsent | None = None


class MatterUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    client_name: str | None = Field(default=None, min_length=1, max_length=200)
    our_side: str | None = Field(default=None, min_length=1, max_length=60)
    court: str | None = Field(default=None, max_length=200)
    jurisdiction: str | None = Field(default=None, max_length=200)
    practice_area: str | None = Field(default=None, max_length=200)
    profile: MatterProfile | None = None
    ai_consent: AiConsent | None = None


class MatterCounts(ResponseModel):
    documents: int
    conversations: int


class MatterUsage(ResponseModel):
    """Compute per matter (DEC-71)."""

    tokens_in: int
    tokens_out: int
    compute_ms: int


class MatterOut(ResponseModel):
    id: str
    name: str
    client_name: str
    our_side: str
    court: str | None = None
    jurisdiction: str | None = None
    practice_area: str | None = None
    profile: MatterProfile
    ai_consent: AiConsent
    status: Literal["open", "closed"]
    counts: MatterCounts
    usage: MatterUsage
    created_at: Timestamp
    closed_at: Timestamp | None = None
    last_activity_at: Timestamp


class CounselBrief(ResponseModel):
    name: str
    firm: str | None = None


class MatterSummaryOut(ResponseModel):
    id: str
    name: str
    client_name: str
    our_side: str
    status: Literal["open", "closed"]
    document_count: int
    last_activity_at: Timestamp
    # For the matter switcher and the matters page, without loading each profile (INT-1.3)
    court: str | None = None
    practice_area: str | None = None
    opposing_party: str | None = None
    opposing_counsel: CounselBrief | None = None
