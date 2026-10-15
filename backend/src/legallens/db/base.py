"""Declarative base, column types and the MatterScoped mixin."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, TypeDecorator
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

from legallens.timeutil import as_utc


class UTCDateTime(TypeDecorator[datetime]):
    """Stores naive UTC in SQLite; always hands back timezone-aware UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        value = as_utc(value)
        return value.replace(tzinfo=None) if value else None

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        return as_utc(value)


class Base(DeclarativeBase):
    type_annotation_map = {datetime: UTCDateTime, dict[str, Any]: JSON, list[Any]: JSON}


class MatterScoped:
    """Every table that holds client data carries matter_id (DEC-53). The scope guard keys off this mixin."""

    @declared_attr
    def matter_id(cls) -> Mapped[str]:
        return mapped_column(String, ForeignKey("matters.id", ondelete="CASCADE"), index=True, nullable=False)
