"""Ditsha ML assistance service.

The deterministic result is authoritative for configured requirements. Statistical
models are optional assistance and never make land decisions.
"""
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

MODEL_VERSION = "rules-1"
app = FastAPI(title="Ditsha ML Assistance", version="0.1.0")


class ApplicationFeatures(BaseModel):
    application_id: str
    application_type: str
    description: str | None = None
    document_names: list[str] = Field(default_factory=list)
    required_documents: list[str] = Field(default_factory=list)
    submitted_at: datetime | None = None
    duplicate_active_count: int = 0
    land_board_workload: int = 0


class AssistanceResponse(BaseModel):
    application_id: str
    score: float | None
    category: str
    reasons: list[str]
    model_version: str
    deterministic: bool
    created_at: datetime


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ditsha-ml"}


@app.get("/ready")
def ready() -> dict[str, str]:
    return {"status": "ready", "model_version": MODEL_VERSION}


@app.post("/v1/assist", response_model=AssistanceResponse)
def assist(features: ApplicationFeatures) -> AssistanceResponse:
    submitted = set(features.document_names)
    missing = [name for name in features.required_documents if name not in submitted]
    reasons: list[str] = [f"Missing document: {name}" for name in missing]
    if not features.description or len(features.description.strip()) < 20:
        reasons.append("Description is missing or too short")
    if features.duplicate_active_count:
        reasons.append("Possible duplicate active application")

    completeness = 1.0
    if features.required_documents:
        completeness -= min(1.0, len(missing) / len(features.required_documents))
    if not features.description or len(features.description.strip()) < 20:
        completeness = max(0.0, completeness - 0.2)
    category = "complete" if not reasons else "needs_review"
    return AssistanceResponse(
        application_id=features.application_id,
        score=round(completeness, 5),
        category=category,
        reasons=reasons,
        model_version=MODEL_VERSION,
        deterministic=True,
        created_at=datetime.now(timezone.utc),
    )
