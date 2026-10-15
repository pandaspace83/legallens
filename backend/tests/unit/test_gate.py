"""The "Not found" gate when the reranker is on (CL-2.2). The scores are the ones in GATE_BENCHMARK.md."""

import pytest

from legallens.config import Settings
from legallens.orchestrator.stub.orchestrator import reranker_gate

S = Settings(env="test")


@pytest.mark.parametrize(
    ("top", "keyword", "expected"),
    [
        (0.924, 0.60, True),  # notice to terminate
        (0.371, 0.50, True),  # late-payment interest
        (0.486, 0.33, True),  # "Can we end the agreement early?": the keyword gate wrongly refused this
        (0.611, 0.33, True),  # "How long does the agreement last?": same
        (0.070, 0.67, True),  # a terse address passage, rescued by the keyword share
        (0.163, 0.50, False),  # "Who is the chief executive of Acme Corp?"
        (0.018, 0.50, False),  # "How many employees does Smith Logistics have?"
        (0.008, 0.33, False),  # "What law governs this agreement?"
        (0.000, 1.00, False),  # a keyword match alone, with no relevance, is not enough
    ],
)
def test_gate_decisions(top: float, keyword: float, expected: bool) -> None:
    assert reranker_gate(top, keyword, S) is expected
