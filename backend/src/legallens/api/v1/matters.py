"""B · Matters: the switcher list, profile, close, export and delete."""

from typing import Literal

from fastapi import APIRouter, Query, Response

from legallens.api.deps import AppSettings, CurrentUser, ReadDB, WriteDB, load_matter
from legallens.errors import ApiError
from legallens.schemas.common import Page, problem_responses
from legallens.schemas.jobs import JobAccepted
from legallens.schemas.matters import MatterCreate, MatterOut, MatterSummaryOut, MatterUpdate
from legallens.services import deletion, exports
from legallens.services import matters as svc

router = APIRouter(prefix="/matters", tags=["B · Matters"])


@router.get("", operation_id="listMatters", responses=problem_responses(401))
def list_matters(
    me: CurrentUser,
    db: ReadDB,
    status: Literal["open", "closed", "all"] = "all",
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> Page[MatterSummaryOut]:
    items, next_cursor = svc.list_for_user(db, me, status, cursor, limit)
    return Page[MatterSummaryOut](items=items, next_cursor=next_cursor)


@router.post("", status_code=201, operation_id="createMatter", responses=problem_responses(401, 422))
def create_matter(body: MatterCreate, me: CurrentUser, db: WriteDB) -> MatterOut:
    matter = svc.create(db, me, body)
    db.commit()
    return svc.to_out(db, matter)


@router.get("/{matter_id}", operation_id="getMatter", responses=problem_responses(401, 403, 404))
def get_matter(matter_id: str, me: CurrentUser, db: ReadDB) -> MatterOut:
    return svc.to_out(db, load_matter(db, me, matter_id))


@router.patch("/{matter_id}", operation_id="updateMatter", responses=problem_responses(401, 403, 404, 409, 422))
def update_matter(matter_id: str, body: MatterUpdate, me: CurrentUser, db: WriteDB) -> MatterOut:
    matter = load_matter(db, me, matter_id, writable=True)
    svc.update(db, me, matter, body)
    db.commit()
    return svc.to_out(db, matter)


@router.post("/{matter_id}/close", operation_id="closeMatter", responses=problem_responses(401, 403, 404))
def close_matter(matter_id: str, me: CurrentUser, db: WriteDB) -> MatterOut:
    """Makes the matter read-only (DEC-32). Closing an already closed matter is a no-op."""
    matter = load_matter(db, me, matter_id)
    svc.close(db, me, matter)
    db.commit()
    return svc.to_out(db, matter)


@router.post(
    "/{matter_id}/export", status_code=202, operation_id="exportMatter", responses=problem_responses(401, 403, 404)
)
def export_matter(matter_id: str, me: CurrentUser, db: WriteDB) -> JobAccepted:
    """Queues the full matter file as a .zip (DEC-33); download it from GET /jobs/{job_id}/file when done.
    Allowed on closed matters too: that is when the client's file is usually returned."""
    matter = load_matter(db, me, matter_id)
    job = exports.start_matter_export(db, me, matter)
    db.commit()
    return JobAccepted(job_id=job.id)


@router.delete(
    "/{matter_id}", status_code=204, operation_id="deleteMatter", responses=problem_responses(401, 403, 404, 422)
)
def delete_matter(
    matter_id: str,
    me: CurrentUser,
    db: WriteDB,
    settings: AppSettings,
    confirm: str = Query(..., description="The matter name, typed exactly (DEC-34)."),
) -> Response:
    matter = load_matter(db, me, matter_id)
    if confirm.strip() != matter.name.strip():
        raise ApiError(422, "confirmation_mismatch", "Type the matter name exactly to confirm.")
    deletion.delete_matter(db, settings, me, matter)
    return Response(status_code=204)
