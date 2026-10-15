"""Request dependencies and matter-access helpers.

Every route that touches client data goes through `load_matter` or `load_in_matter`:
404 if the thing doesn't exist, 403 if the signed-in lawyer doesn't own its matter, 409 for a write to a closed
matter. Both scope the session to that matter, after which the scope guard filters every query (DEC-53).
"""

from collections.abc import Iterator
from typing import Annotated, Any, TypeVar

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.db.models import Matter
from legallens.db.scope import set_scope, unscoped
from legallens.errors import forbidden_matter, matter_closed, not_found
from legallens.services.auth import COOKIE_NAME, Principal, resolve

T = TypeVar("T")


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def read_db(request: Request) -> Iterator[Session]:
    session = get_database(request).read_session()
    try:
        yield session
    finally:
        session.close()


def write_db(request: Request) -> Iterator[Session]:
    """A BEGIN IMMEDIATE session. Routes commit explicitly; anything uncommitted is rolled back."""
    session = get_database(request).write_session()
    try:
        yield session
    finally:
        session.close()


def current_principal(request: Request) -> Principal:
    return resolve(get_database(request), get_app_settings(request), request.cookies.get(COOKIE_NAME))


ReadDB = Annotated[Session, Depends(read_db)]
WriteDB = Annotated[Session, Depends(write_db)]
CurrentUser = Annotated[Principal, Depends(current_principal)]
AppSettings = Annotated[Settings, Depends(get_app_settings)]
AppDatabase = Annotated[Database, Depends(get_database)]


def load_matter(db: Session, me: Principal, matter_id: str, *, writable: bool = False) -> Matter:
    matter = db.get(Matter, matter_id)
    if matter is None:
        raise not_found("Matter")
    if matter.owner_user_id != me.user.id:
        raise forbidden_matter()
    if writable and matter.status == "closed":
        raise matter_closed()
    set_scope(db, matter.id)
    return matter


def load_in_matter(
    db: Session, me: Principal, model: type[T], entity_id: Any, *, writable: bool = False, label: str | None = None
) -> tuple[T, Matter]:
    """Loads a matter-scoped row by id: resolve its matter (unscoped, id only), check access, then load scoped."""
    label = label or model.__name__
    with unscoped(db):
        matter_id = db.execute(select(model.matter_id).where(model.id == entity_id)).scalar()  # type: ignore[attr-defined]
    if matter_id is None:
        raise not_found(label)
    matter = load_matter(db, me, matter_id, writable=writable)
    obj = db.get(model, entity_id)
    if obj is None:
        raise not_found(label)
    return obj, matter
