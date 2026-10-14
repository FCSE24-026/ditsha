"""Reproducible synthetic comparison for Ditsha completeness assistance.

Synthetic labels are generated from explicit requirements and are only useful
for pipeline validation; they are not evidence of real-world model quality.
"""
import json
import time
from pathlib import Path

import joblib
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier

SEED = 42
OUT = Path(__file__).parent / "artifacts"


def make_records(size=600):
    records = []
    for index in range(size):
        required = 2 + (index % 3)
        supplied = max(0, required - (index % 4))
        short_description = index % 5 == 0
        missing = supplied < required
        records.append({
            "application_type": ["residential_allocation", "land_transfer", "lease_renewal"][index % 3],
            "required_document_count": required,
            "supplied_document_count": supplied,
            "description_length": 8 if short_description else 80,
            "duplicate_active_count": 1 if index % 17 == 0 else 0,
            "label_incomplete": int(missing or short_description),
        })
    return records


def main():
    records = make_records()
    features = ["application_type", "required_document_count", "supplied_document_count",
                "description_length", "duplicate_active_count"]
    target = "label_incomplete"
    x = [{key: row[key] for key in features} for row in records]
    y = [row[target] for row in records]
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.25, random_state=SEED, stratify=y
    )
    preprocessor = ColumnTransformer([
        ("category", OneHotEncoder(handle_unknown="ignore"), ["application_type"]),
        ("numeric", StandardScaler(), [
            "required_document_count", "supplied_document_count",
            "description_length", "duplicate_active_count",
        ]),
    ])
    candidates = {
        "logistic-regression": LogisticRegression(random_state=SEED, max_iter=1000),
        "decision-tree": DecisionTreeClassifier(random_state=SEED, max_depth=4),
        "random-forest": RandomForestClassifier(random_state=SEED, n_estimators=100, max_depth=6),
    }
    results = {"dataset": {"source": "synthetic", "size": len(records), "seed": SEED,
                           "target": target, "positive_rate": sum(y) / len(y)}}
    OUT.mkdir(exist_ok=True)
    for name, estimator in candidates.items():
        model = Pipeline([("preprocess", preprocessor), ("model", estimator)])
        started = time.perf_counter()
        model.fit(x_train, y_train)
        train_ms = round((time.perf_counter() - started) * 1000, 3)
        probabilities = model.predict_proba(x_test)[:, 1]
        predictions = (probabilities >= 0.5).astype(int)
        results[name] = {
            "precision": precision_score(y_test, predictions, zero_division=0),
            "recall": recall_score(y_test, predictions, zero_division=0),
            "f1": f1_score(y_test, predictions, zero_division=0),
            "pr_auc": average_precision_score(y_test, probabilities),
            "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
            "training_ms": train_ms,
        }
        joblib.dump(model, OUT / f"{name}.joblib")
    (OUT / "comparison.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
