# Ditsha ML assistance service

This service provides transparent, non-binding assistance to officers. The
deterministic completeness result is authoritative; the service never approves,
rejects, or allocates land.

## Run locally

```powershell
cd ml-service
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API exposes `/health`, `/ready`, and `POST /v1/assist`. The reproducible
`train_compare.py` script evaluates logistic regression, decision tree, and
random forest against the deterministic label-generation baseline using
synthetic data. Its output is explicitly labelled synthetic and must not be
interpreted as evidence of real-world effectiveness.
