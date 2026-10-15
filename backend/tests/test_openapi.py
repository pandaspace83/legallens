"""The API contract: openapi.json is committed, and a change to the API must update it (BE-9.5)."""

import json
from pathlib import Path

from legallens.main import create_app
from tests.conftest import make_settings

SPEC = Path(__file__).resolve().parent.parent / "openapi.json"


def _spec(tmp_path: Path) -> dict:  # type: ignore[type-arg]
    return create_app(make_settings(tmp_path)).openapi()


def test_committed_spec_matches_the_app(tmp_path: Path) -> None:
    committed = json.loads(SPEC.read_text())
    assert committed == json.loads(json.dumps(_spec(tmp_path), sort_keys=True)), (
        "The API changed. Run `uv run legallens openapi` and commit openapi.json."
    )


def test_every_operation_is_named_and_documents_its_errors(tmp_path: Path) -> None:
    spec = _spec(tmp_path)
    operations = [(m, p, o) for p, v in spec["paths"].items() for m, o in v.items()]
    assert len(operations) == 50  # 43 built + 6 added in integration Phase 1 (INT-1.3, INT-1.6, INT-1.7)
    ids = [o["operationId"] for _, _, o in operations]
    assert len(set(ids)) == len(ids)
    for method, path, operation in operations:
        if path != "/api/v1/health":
            assert any(code.startswith("4") for code in operation["responses"]), (method, path)
