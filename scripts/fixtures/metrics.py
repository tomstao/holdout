"""Expected metric values for src/domain/metrics.test.ts, computed by scikit-learn.

Run by hand from the repository root, with scikit-learn 1.6 or later installed
(scripts/fixtures/requirements.txt):

    PYTHONUTF8=1 python scripts/fixtures/metrics.py

It rewrites src/domain/metrics.fixtures.json. The data is seeded, so the file
changes only when this script changes or scikit-learn's arithmetic does. The
versions used are recorded in the file.
"""

from __future__ import annotations

import json
import pathlib
import warnings

import numpy as np
import sklearn
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    root_mean_squared_error,
)

OUTPUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "domain" / "metrics.fixtures.json"

rng = np.random.default_rng(20261119)

PENGUINS = ["Adelie", "Chinstrap", "Gentoo"]


def noisy_labels(labels: list[str], n: int, right: float, weights: list[float] | None = None):
    """`n` true labels and predictions that agree with them about `right` of the time."""
    truth = rng.choice(labels, size=n, p=weights)
    wrong = rng.choice(labels, size=n)
    predicted = np.where(rng.random(n) < right, truth, wrong)
    return truth.tolist(), predicted.tolist()


def classification_case(name: str, truth: list[str], predicted: list[str]) -> dict:
    with warnings.catch_warnings():
        # A label that is predicted but never true has no recall; scikit-learn
        # warns and scores it 0, which is the behaviour the app relies on.
        warnings.simplefilter("ignore")
        macro_f1 = f1_score(truth, predicted, average="macro")
    return {
        "name": name,
        "truth": truth,
        "predicted": predicted,
        "accuracy": float(accuracy_score(truth, predicted)),
        "macro_f1": float(macro_f1),
    }


def regression_case(name: str, truth, predicted) -> dict:
    truth = [float(value) for value in truth]
    predicted = [float(value) for value in predicted]
    return {
        "name": name,
        "truth": truth,
        "predicted": predicted,
        "rmse": float(root_mean_squared_error(truth, predicted)),
        "mae": float(mean_absolute_error(truth, predicted)),
    }


def classification_cases() -> list[dict]:
    cases = [
        classification_case("three classes, about 80% right", *noisy_labels(PENGUINS, 500, 0.8)),
        classification_case("two classes, balanced", *noisy_labels(["no", "yes"], 200, 0.7)),
        classification_case(
            "five classes, heavily imbalanced",
            *noisy_labels(["a", "b", "c", "d", "e"], 1000, 0.6, [0.7, 0.2, 0.06, 0.03, 0.01]),
        ),
        classification_case("everything right", PENGUINS * 10, PENGUINS * 10),
        classification_case("everything wrong", ["a", "b", "c"] * 5, ["b", "c", "a"] * 5),
        classification_case("one true class, all right", ["Adelie"] * 12, ["Adelie"] * 12),
        classification_case(
            "one true class, some predictions are another label",
            ["Adelie"] * 10,
            ["Adelie"] * 7 + ["Gentoo"] * 3,
        ),
        classification_case(
            "a true label that is never predicted",
            ["a"] * 6 + ["b"] * 6 + ["c"] * 3,
            ["a"] * 6 + ["b"] * 6 + ["a", "b", "a"],
        ),
        classification_case("one row, right", ["Gentoo"], ["Gentoo"]),
        classification_case("one row, wrong", ["Gentoo"], ["Adelie"]),
        classification_case(
            "labels with spaces, accents and digits",
            ["très bien", "10", "0", "très bien", "N/A", "10", "0", "N/A"],
            ["très bien", "10", "10", "N/A", "N/A", "0", "0", "très bien"],
        ),
    ]
    return cases


def regression_cases() -> list[dict]:
    truth = rng.normal(50, 15, 1000)
    large = rng.uniform(1e6, 5e6, 400)
    small = rng.uniform(-1e-6, 1e-6, 400)
    mixed = np.concatenate([rng.normal(0, 1, 300), rng.normal(0, 1e6, 5)])
    rng.shuffle(mixed)
    counts = rng.integers(0, 500, 300)
    return [
        regression_case("normal noise", truth, truth + rng.normal(0, 5, truth.size)),
        regression_case("exact predictions", truth[:50], truth[:50]),
        regression_case("constant offset", truth[:200], truth[:200] + 2.5),
        regression_case("large values", large, large * rng.normal(1, 0.01, large.size)),
        regression_case("tiny values", small, small + rng.normal(0, 1e-7, small.size)),
        regression_case("a few huge errors among small ones", np.zeros(mixed.size), mixed),
        regression_case("integer counts", counts, np.round(counts * rng.normal(1, 0.2, 300))),
        regression_case("negative and positive", [-3.5, -1, 0, 2, 10], [-3, -1.5, 0.25, 2, 7]),
        regression_case("one row", [3.25], [1.75]),
        regression_case("one row, exact", [0.1], [0.1]),
    ]


def main() -> None:
    document = {
        "generatedBy": "scripts/fixtures/metrics.py",
        "versions": {"scikit-learn": sklearn.__version__, "numpy": np.__version__},
        "classification": classification_cases(),
        "regression": regression_cases(),
    }
    # One case per line keeps a regenerated file reviewable in a diff.
    lines = ["{"]
    lines.append(f' "generatedBy": {json.dumps(document["generatedBy"])},')
    lines.append(f' "versions": {json.dumps(document["versions"])},')
    for index, kind in enumerate(["classification", "regression"]):
        lines.append(f' "{kind}": [')
        cases = document[kind]
        for position, case in enumerate(cases):
            comma = "," if position < len(cases) - 1 else ""
            lines.append("  " + json.dumps(case, ensure_ascii=False) + comma)
        lines.append(" ]" + ("," if index == 0 else ""))
    lines.append("}")
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    total = len(document["classification"]) + len(document["regression"])
    print(f"wrote {total} cases to {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
