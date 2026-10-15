"""Opaque cursors: base64url JSON of the sort key of the last row on the page."""

import base64
import json
from typing import Any

from legallens.errors import ApiError


def encode_cursor(values: list[Any]) -> str:
    raw = json.dumps(values, separators=(",", ":"), default=str).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> list[Any] | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        values = json.loads(base64.urlsafe_b64decode(padded.encode()))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ApiError(422, "invalid_cursor", "The cursor is not valid.") from exc
    if not isinstance(values, list):
        raise ApiError(422, "invalid_cursor", "The cursor is not valid.")
    return values


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
