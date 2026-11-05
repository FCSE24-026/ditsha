"""Delay-prediction comparison on synthetic Land Board applications.

Processing days are simulated from workflow inputs plus noise. The label is
derived from processing days, which is NOT a model input. Coefficients are
documented assumptions, not measured Land Board data.
"""
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, confusion_matrix,
                             accuracy_score, f1_score, precision_score, recall_score)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier

SEED = 42
DELAY_DAYS = 30
TYPES = ["residential_allocation", "land_transfer", "lease_renewal"]
BASE_DAYS = {"residential_allocation": 14, "land_transfer": 24, "lease_renewal": 10}
OUT = Path(__file__).parent / "artifacts"


def make_records(n=600, seed=SEED):
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        app_type = TYPES[i % 3]
        required = 2 + (i % 3)
        supplied = int(max(0, required - rng.integers(0, 4)))
        desc_len = int(rng.choice([8, 40, 80, 150]))
        duplicates = int(rng.random() < 0.06)
        workload = int(rng.integers(5, 80))
        days = (BASE_DAYS[app_type]
                + 4 * (required - supplied)
                + (6 if desc_len < 20 else 0)
                + 0.25 * workload
                + 5 * duplicates
                + rng.normal(0, 8))
        rows.append({
            "application_type": app_type,
            "required_document_count": required,
            "supplied_document_count": supplied,
            "description_length": desc_len,
            "duplicate_active_count": duplicates,
            "land_board_workload": workload,
            "processing_days": max(1.0, float(days)),
            "label_delayed": int(days > DELAY_DAYS),
        })
    return rows


CATEGORICAL = ["application_type"]
NUMERIC = ["required_document_count", "supplied_document_count",
           "description_length", "duplicate_active_count", "land_board_workload"]


def pipeline(model):
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("num", StandardScaler(), NUMERIC),
    ])
    return Pipeline([("pre", pre), ("model", model)])


def evaluate(name, clf, x_test, y_test):
    pred = clf.predict(x_test)
    proba = clf.predict_proba(x_test)[:, 1] if hasattr(clf, "predict_proba") else pred
    return {
        "accuracy": round(accuracy_score(y_test, pred), 4),
        "precision": round(precision_score(y_test, pred, zero_division=0), 4),
        "recall": round(recall_score(y_test, pred, zero_division=0), 4),
        "f1": round(f1_score(y_test, pred, zero_division=0), 4),
        "pr_auc": round(average_precision_score(y_test, proba), 4),
        "confusion_matrix": confusion_matrix(y_test, pred).tolist(),
    }


def main():
    import pandas as pd
    df = pd.DataFrame(make_records())
    x = df[CATEGORICAL + NUMERIC]
    y = df["label_delayed"]

    x_tr, x_te, y_tr, y_te = train_test_split(
        x, y, test_size=0.25, random_state=SEED, stratify=y)

    models = {
        "baseline-majority": DummyClassifier(strategy="most_frequent"),
        "logistic-regression": LogisticRegression(random_state=SEED, max_iter=1000),
        "decision-tree": DecisionTreeClassifier(random_state=SEED, max_depth=4),
        "random-forest": RandomForestClassifier(random_state=SEED, n_estimators=100, max_depth=6),
    }

    report = {"dataset": {
        "source": "synthetic", "size": len(df), "seed": SEED,
        "target": "label_delayed", "delay_threshold_days": DELAY_DAYS,
        "positive_rate": round(float(y.mean()), 4),
        "train_size": len(x_tr), "test_size": len(x_te),
        "excluded_from_features": ["processing_days", "label_delayed"],
    }}
    OUT.mkdir(exist_ok=True)
    for name, model in models.items():
        clf = pipeline(model).fit(x_tr, y_tr)
        report[name] = evaluate(name, clf, x_te, y_te)
        joblib.dump(clf, OUT / f"delay-{name}.joblib")

    (OUT / "comparison_delay.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()