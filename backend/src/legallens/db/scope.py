"""Matter-scope guard (DEC-53, RISK-04).

Once a session is scoped to a matter, every ORM SELECT, UPDATE and DELETE on a client-data table gets
`matter_id = :matter` added, and every row written must belong to that matter. A query on a client-data table
from a session with no scope raises MatterScopeError instead of silently reading across matters.

The only way around it is an explicit `with unscoped(session):` block, used to resolve which matter an ID
belongs to (before the ownership check) and by the worker to claim jobs.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from legallens.db.base import MatterScoped

SCOPE_KEY = "matter_scope"
UNSCOPED_KEY = "unscoped_depth"


class MatterScopeError(RuntimeError):
    pass


def set_scope(session: Session, matter_id: str) -> None:
    current = session.info.get(SCOPE_KEY)
    if current is not None and current != matter_id:
        raise MatterScopeError("A session can be scoped to one matter only.")
    session.info[SCOPE_KEY] = matter_id


def get_scope(session: Session) -> str | None:
    return session.info.get(SCOPE_KEY)


@contextmanager
def unscoped(session: Session) -> Iterator[Session]:
    session.info[UNSCOPED_KEY] = session.info.get(UNSCOPED_KEY, 0) + 1
    try:
        yield session
    finally:
        session.info[UNSCOPED_KEY] -= 1


def _is_unscoped(session: Session) -> bool:
    return bool(session.info.get(UNSCOPED_KEY))


@event.listens_for(Session, "do_orm_execute")
def _add_matter_criteria(state: ORMExecuteState) -> None:
    if not (state.is_select or state.is_update or state.is_delete):
        return
    if _is_unscoped(state.session):
        return
    scoped_classes = {m.class_ for m in state.all_mappers if issubclass(m.class_, MatterScoped)}
    if not scoped_classes:
        return
    matter_id = state.session.info.get(SCOPE_KEY)
    if matter_id is None:
        names = ", ".join(sorted(c.__name__ for c in scoped_classes))
        raise MatterScopeError(f"Query on {names} without a matter scope.")
    state.statement = state.statement.options(
        *[with_loader_criteria(cls, _matter_criteria(matter_id), include_aliases=True) for cls in scoped_classes]
    )


def _matter_criteria(matter_id: str) -> Any:
    # A closure (not a default argument): SQLAlchemy turns closure variables into bound parameters, so a
    # cached statement never carries one matter's id into another matter's query.
    return lambda cls: cls.matter_id == matter_id


@event.listens_for(Session, "before_flush")
def _check_written_rows(session: Session, _ctx: Any, _instances: Any) -> None:
    if _is_unscoped(session):
        return
    matter_id = session.info.get(SCOPE_KEY)
    for obj in [*session.new, *session.dirty, *session.deleted]:
        if not isinstance(obj, MatterScoped):
            continue
        if matter_id is None:
            raise MatterScopeError(f"Writing {type(obj).__name__} without a matter scope.")
        if obj.matter_id != matter_id:
            raise MatterScopeError(f"Writing {type(obj).__name__} into a different matter.")
