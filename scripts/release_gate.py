"""The release gate (NFR-06): compare a golden-set run with the baseline and fail on any drop.

    python scripts/release_gate.py [--results GOLDEN_SET.json] [--baseline golden_baseline.json] [--model NAME]

Exit code 0 passes, 1 fails. Invented answers must be 0 whatever the baseline says.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HIGHER_IS_BETTER = ("correct", "right_document", "verified", "refused")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, default=ROOT / "GOLDEN_SET.json")
    parser.add_argument("--baseline", type=Path, default=ROOT / "golden_baseline.json")
    parser.add_argument("--model", default=None, help="Check one model; default: every model in the results.")
    args = parser.parse_args()

    results = json.loads(args.results.read_text())
    baseline = json.loads(args.baseline.read_text())
    models = [args.model] if args.model else list(results)
    failures: list[str] = []
    for model in models:
        if model not in results:
            failures.append(f"{model}: not in {args.results.name}")
            continue
        base = baseline.get(model)
        now = results[model]
        if now.get("invented", 0) > 0:
            failures.append(f"{model}: {now['invented']} invented answer(s); the limit is 0")
        if base is None:
            print(f"{model}: no baseline yet, only the invented-answer rule was checked")
            continue
        for key in HIGHER_IS_BETTER:
            if now.get(key, 0) < base[key]:
                failures.append(f"{model}: {key} fell from {base[key]} to {now.get(key, 0)}")
        print(
            f"{model}: correct {now['correct']}/{now['answerable']}, verified {now['verified']}, "
            f"not-found {now['refused']}/{now['unanswerable']}, invented {now['invented']}"
        )
    if failures:
        print("\nRELEASE BLOCKED:")
        for line in failures:
            print(f"  - {line}")
        return 1
    print("\nRelease gate passed: no drop from the baseline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
