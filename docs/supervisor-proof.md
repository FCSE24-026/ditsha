# Supervisor Evidence Pack

You can prove it with a **three-part evidence pack**: database evidence, API test evidence, and ML reproducibility evidence.

## 1. Prove the database changed

Show the supervisor the schema and migration files:

- [db/schema.sql](../db/schema.sql)
- [005_application_lifecycle_documents.sql](../db/migrations/005_application_lifecycle_documents.sql)
- [001_workflow_support.sql](../db/migrations/001_workflow_support.sql)

Run:

```powershell
cd C:\Users\FCSE24-026\Desktop\ditsha-app

rg -n "application_document|ml_prediction|version|checksum|deleted_at|replaced_document_id|superseded_at" `
  db\schema.sql db\migrations
```

Expected evidence includes:

```text
application_document
ml_prediction
checksum_sha256
version
replaced_document_id
superseded_at
deleted_at
```

Then prove the tables exist in PostgreSQL:

```powershell
docker exec -it ditsha-backend-db-1 psql -U postgres -d ditsha -c `
"\dt application_document ml_prediction"

docker exec -it ditsha-backend-db-1 psql -U postgres -d ditsha -c `
"\d application_document"

docker exec -it ditsha-backend-db-1 psql -U postgres -d ditsha -c `
"\d ml_prediction"
```

For the supervisor, explain:

> `application_document` is now the source of truth for uploaded documents. It stores document metadata, checksum, version, replacement relationship, and soft-deletion fields. `ml_prediction` stores ML assistance results. There is no `RISK_SCORE` implementation in the current schema.

You can explicitly verify the old table is absent:

```powershell
docker exec -it ditsha-backend-db-1 psql -U postgres -d ditsha -c `
"SELECT to_regclass('public.risk_score') AS old_risk_score,
        to_regclass('public.ml_prediction') AS current_prediction_table,
        to_regclass('public.application_document') AS current_document_table;"
```

Expected result:

```text
old_risk_score       | 
current_prediction_table | ml_prediction
current_document_table   | application_document
```

## 2. Prove the API is beyond the Review 2 endpoint list

The implementation is in [applications.js](../api/routes/applications.js).

Run:

```powershell
rg -n "router\.(get|post|put|patch|delete)" `
  api\routes\applications.js api\routes\auth.js api\routes\admin.js
```

Important current endpoints include:

```text
POST /api/applications/draft
GET  /api/applications/drafts
POST /api/applications
POST /api/applications/:id/documents
GET  /api/applications/:id/documents/:documentId
POST /api/applications/:id/respond
POST /api/applications/:id/withdraw
POST /api/officer/applications/:id/request-info
POST /api/officer/applications/:id/assign
POST /api/officer/applications/:id/override-priority
POST /api/officer/applications/:id/status
GET  /api/officer/applications
GET  /api/officer/analytics/dashboard
POST /api/refresh
POST /api/logout
```

The strongest proof is the automated test suite:

```powershell
cd C:\Users\FCSE24-026\Desktop\ditsha-app\api
npm test
```

Current result:

```text
Test Suites: 1 passed
Tests:       10 passed
```

The relevant tests are in [api.test.js](../api/tests/api.test.js):

- Draft creation, retrieval, and submission
- Invalid document signature rejection
- Valid document upload and authorized download
- Request-information loop
- Citizen response
- Priority override
- Officer assignment
- Citizen withdrawal

You can show the exact test names:

```powershell
rg -n "supports citizen draft|validates document|request-info|withdraw" `
  api\tests\api.test.js
```

A good explanation to your supervisor is:

> These are not just planned endpoints. They are exercised by integration tests against PostgreSQL, including negative authorization and invalid-file cases.

## 3. Prove the ML leakage correction

There are two separate artifacts and they should be presented separately.

### Old leaking experiment

Open:

- [comparison.json](../ml-service/artifacts/comparison.json)
- [train_compare.py](../ml-service/train_compare.py)

The old report explicitly shows:

```json
"target": "label_incomplete"
```

and:

```json
"precision": 1.0,
"recall": 1.0,
"f1": 1.0,
"pr_auc": 1.0
```

Explain:

> The completeness label was derived from the same document-completeness features supplied to the model. Therefore, the perfect score was leakage. We retained the result for transparency but no longer treat it as evidence of predictive quality.

### Current delay model

Open:

- [train_delay.py](../ml-service/train_delay.py)
- [comparison_delay.json](../ml-service/artifacts/comparison_delay.json)

The current report says:

```json
"target": "label_delayed",
"delay_threshold_days": 30,
"excluded_from_features": [
  "processing_days",
  "label_delayed"
]
```

The current model results are approximately:

```text
Logistic regression:
accuracy  = 0.7400
precision = 0.7451
recall    = 0.8539
f1        = 0.7958
pr_auc    = 0.8928

Random forest:
accuracy  = 0.7400
precision = 0.7404
recall    = 0.8652
f1        = 0.7979
pr_auc    = 0.8872
```

Run the reproducible training script:

```powershell
cd C:\Users\FCSE24-026\Desktop\ditsha-app\ml-service

C:\Users\matlh\AppData\Local\Programs\Python\Python313\python.exe train_delay.py
```

Then verify that the generated report matches the committed report:

```powershell
git diff --exit-code -- ml-service/artifacts/comparison_delay.json
```

If there is no output and the exit code is `0`, the generated result matches the committed artifact.

You can also run the ML service tests:

```powershell
python -m unittest -v
```

Expected result:

```text
Ran 3 tests
OK
```

## Recommended supervisor demonstration

Use this sequence during the review:

```powershell
cd C:\Users\FCSE24-026\Desktop\ditsha-app

git log --oneline -5

docker exec -it ditsha-backend-db-1 psql -U postgres -d ditsha -c `
"SELECT to_regclass('public.application_document'),
        to_regclass('public.ml_prediction'),
        to_regclass('public.risk_score');"

cd api
npm test

cd ..\ml-service
python train_delay.py
python -m unittest -v
```

Then summarize:

> The database evidence proves the planned entities are implemented. The API integration tests prove the expanded workflows are executable, not merely documented. The ML artifacts prove both the original leakage problem and the corrected delay-target experiment. The current model excludes `processing_days` and the target label from its features, so the perfect 1.0 completeness result is no longer being presented as valid model performance.

The implementation and evidence are included in commit [`db2653a`](https://github.com/FCSE24-026/disha/commit/db2653a99fbfa440022c2641a29294e7d740b514).
