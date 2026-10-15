"""E · Documents, viewer pages and citations."""

from typing import Literal

from pydantic import Field

from legallens.schemas.common import BBox, ErrorInfo, ResponseModel, Timestamp

Origin = Literal["client", "other_party"]
DocumentStatus = Literal["queued", "processing", "ready", "failed", "quarantined"]
HiddenKind = Literal[
    "tracked_changes",
    "comments",
    "hidden_text",
    "white_text",
    "tiny_text",
    "metadata",
    "annotations",
    "embedded_files",
]


class HiddenContentNotice(ResponseModel):
    """Notice only (DEC-59): what kinds were found, not what they say."""

    kinds: list[HiddenKind]
    count: int


class LowConfidencePage(ResponseModel):
    page: int
    ocr_conf: float


class Coverage(ResponseModel):
    """DEC-42: what was actually read."""

    pages_total: int
    pages_read: int
    pages_unreadable: list[int]
    ocr_pages: list[int]
    low_confidence_pages: list[LowConfidencePage]
    text: str


class DocumentOut(ResponseModel):
    id: str
    matter_id: str
    filename: str
    mime: str
    size_bytes: int
    sha256: str
    origin: Origin
    status: DocumentStatus
    scan_status: Literal["clean", "infected", "skipped"]
    pages_total: int | None = None
    pages_processed: int = 0
    ocr_conf_avg: float | None = None
    hidden_content: HiddenContentNotice | None = None
    parent_document_id: str | None = None
    error: ErrorInfo | None = None
    uploaded_at: Timestamp
    ready_at: Timestamp | None = None
    # In the list as well as the detail: the documents table flags unreadable and low-confidence pages (INT-2.2)
    coverage: Coverage | None = None


class DocumentDetailOut(DocumentOut):
    chunk_count: int = 0
    defined_term_count: int = 0
    job_id: str | None = None


class UploadAccepted(ResponseModel):
    document_id: str
    job_id: str
    status: Literal["queued"] = "queued"


class Block(ResponseModel):
    id: int
    kind: str
    text: str
    bbox: BBox
    section_path: str | None = None
    ref: str | None = None  # the paragraph's pinpoint, e.g. "4.2(b)" or "¶3"; matches citations' para_ref


class PageBlocks(ResponseModel):
    page_no: int
    width: float
    height: float
    has_text_layer: bool
    ocr_conf: float | None = None
    blocks: list[Block]


class PagesOut(ResponseModel):
    document_id: str
    pages_total: int
    pages: list[PageBlocks]


class HiddenItem(ResponseModel):
    kind: HiddenKind
    page: int | None = None
    location: str
    text: str | None = None


class HiddenContentOut(ResponseModel):
    document_id: str
    origin: Origin
    notice: str
    items: list[HiddenItem]


class CitationLocationOut(ResponseModel):
    id: int
    document_id: str
    document_name: str
    page: int
    para_ref: str | None = None
    quote: str
    bbox: BBox | None = None
    boxes: list[dict[str, object]] = Field(default_factory=list)
    page_width: float | None = None
    page_height: float | None = None
    verified: bool


class RemovedCounts(ResponseModel):
    documents: int
    pages: int
    chunks: int
    fts_rows: int
    vectors: int
    citations: int
    conversations: int  # chats whose answers cite it; they stay, with those citations marked removed (INT-1.5)
    defined_terms: int
    summaries: int
    file_bytes: int


class DeletionReport(ResponseModel):
    document_id: str
    dry_run: bool
    removed: RemovedCounts
