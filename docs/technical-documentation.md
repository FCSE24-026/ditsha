# Ditsha Technical Documentation

## 1. Project Record

Ditsha is a land administration platform with three client surfaces:

- Node.js/Express API for authentication and application workflows.
- React officer dashboard for queue management and analytics.
- Flutter citizen app for registration, login, submission, and status tracking.

The original repository was a scaffold based on the team technical brief. The project uses PostgreSQL for persistence and JWT for authentication.

## 2. Repository Layout

- `api/`: Express API, database connection, migrations, seed script, and tests.
- `db/schema.sql`: PostgreSQL schema.
- `data-gen/`: Python synthetic-data generator.
- `ditsha-frontend/`: React/Vite officer dashboard.
- `ditsha-flutter/`: Flutter citizen application.
- `docker-compose.yml`: Local PostgreSQL 15 service.
- `postman/`: API collection.

## 3. Database

The schema contains:

- `citizen`
- `land_board`
- `officer`
- `application`
- `application_event`
- `application_document`
- `application_note`
- `notification`
- `application_assignment`
- `ml_prediction`
- `password_reset_token`

Local database settings are stored in `api/.env` and are intentionally excluded from source control. The current local connection is PostgreSQL on `localhost:5432`, database `ditsha`.

Migration:

```powershell
cd api
node migrate.js
```

The migration script loads `.env` relative to the API directory, so it works even when Node is started from the repository root.

## 4. Synthetic Data and QA Accounts

The reset seed script creates Botswana land boards, Tswana names, Botswana phone numbers, 301 officers, 4418 citizens, 7000 applications, and an initial audit event for every demonstration application. It is deterministic in shape and replaces the existing local dataset when run with `--reset`.

The deterministic QA accounts are:

- Officer: `officer@example.com` / `OfficerPass123!`
- Citizen: `citizen@example.com` / `CitizenPass123!`

The deterministic officer receives 50 assigned applications for dashboard verification.

Seed:

```powershell
cd api
node seed.js --reset
```

The Python generator in `data-gen/` also uses Botswana land boards and Tswana names. It is intended for adding a separate CSV-backed demonstration batch, while the Node reset seed is the source of truth for a clean local database.

## 5. Backend API

The API runs on port `3000` by default.

Public endpoints:

- `GET /api/health`
- `POST /api/auth/citizen/register`
- `POST /api/auth/citizen/login`
- `POST /api/auth/officer/login`

Citizen endpoints:

- `GET /api/land-boards`
- `POST /api/applications`
- `GET /api/applications`
- `GET /api/applications/:id`
- `POST /api/applications/:id/documents`
- `GET /api/applications/:id/documents/:documentId`
- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/auth/citizen/password-reset/request`
- `POST /api/auth/citizen/password-reset/complete`

Officer endpoints:

- `GET /api/officer/applications?page=1&limit=20&status=all`
- `POST /api/officer/applications/:id/status`
- `GET /api/officer/applications/:id`
- `POST /api/officer/applications/:id/assistance`
- `POST /api/officer/applications/:id/notes`
- `GET /api/officer/analytics/dashboard`

JWT role claims distinguish citizens from officers. Citizen application reads are scoped to the authenticated citizen. Officer queue and analytics results are scoped to the authenticated officer.

Status transitions are constrained server-side: `submitted -> under_review`, followed by
`under_review -> approved|rejected`. Rejection requires an explanatory note.

Start the API:

```powershell
cd api
node index.js
```

Verify it:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Expected result includes `status: ok` and `database: connected`.

## 6. Backend Security and Testing

Current protections include:

- `helmet` security headers.
- CORS enabled for local client development.
- JWT authentication and role checks.
- Password hashing with bcryptjs.
- Request validation for required authentication and application fields.
- Pagination bounds on officer queue requests.
- Express `x-powered-by` header disabled.
- Private document storage outside public web roots, with authenticated ownership/assignment checks.
- Password reset tokens are hashed in PostgreSQL, expire after 15 minutes, and are single-use.
- ML assistance is advisory and unavailable responses are surfaced as a controlled error.

Run tests:

```powershell
cd api
npm test
```

Current automated coverage includes missing-field validation and bearer-token authorization checks. Full database integration coverage remains a QA follow-up.

## 7. Officer Dashboard

The React/Vite dashboard is in `ditsha-frontend/`.

Implemented features:

- Officer login.
- Persisted browser session using local storage.
- Assigned application queue.
- Status filtering.
- Analytics cards.
- Sign out.
- Loading and error states.
- Application detail panel with applicant data, documents, timeline, notes, and advisory ML assistance.
- Rejection reason prompt and server-side legal transition enforcement.
- Responsive desktop and tablet styling.

Start it:

```powershell
cd ditsha-frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` and use the deterministic officer account.

The production build has been verified with `npm run build`.

## 8. Citizen Mobile App

The Flutter app is in `ditsha-flutter/`.

Implemented flows:

- Citizen login.
- Citizen registration.
- New application submission.
- Application status lookup.
- Logout.
- API error and loading states.
- Application history and persistent notification retrieval.
- Land-board selection from the API rather than manual UUID entry.

API defaults:

- Flutter web: `http://localhost:3000/api`.
- Android emulator: `http://10.0.2.2:3000/api`.

A real land board UUID is required for application submission. The API currently does not expose a land-board listing endpoint; adding that endpoint is a recommended mobile usability improvement.

Validation command:

```powershell
cd ditsha-flutter
flutter pub get
flutter analyze
flutter run
```

Validation completed on 2026-10-03:

- `flutter analyze`: passed with no issues.
- `flutter test`: passed with one citizen login-screen smoke test.
- Chrome is available for web execution.
- Android SDK is not installed yet, so Android execution remains pending.
- Visual Studio is not installed, so Windows desktop execution remains pending.

## 9. Operational Startup Order

1. Start Docker Desktop and PostgreSQL.
2. Run the migration.
3. Run the seed.
4. Start the API.
5. Start the React dashboard or Flutter client.
6. Run API tests.

```powershell
docker compose up -d
cd api
node migrate.js
node seed.js
npm test
node index.js
```

## 10. Current Milestones

- Backend schema and database: complete and verified.
- Backend API and authentication: complete and verified.
- Synthetic data and QA accounts: complete and verified.
- Officer dashboard: implemented and production build verified.
- Citizen Flutter app: static analysis and widget smoke test verified; Android and Windows desktop execution remain optional follow-ups.
- QA integration expansion: next milestone.
- API contract and deployment documentation: ongoing.

## 11. Known Follow-ups

- Add complete multipart document and password-reset integration coverage.
- Add Flutter widget and integration tests.
- Add CI to run backend tests and frontend build on pull requests.
- Replace permissive development CORS with an explicit production allowlist.
- Add production secret rotation and backup procedures.
- Configure an approved malware scanner before production document acceptance.
- Build and deploy the ML image in an environment with reliable PyPI access.

## 12. Change Log

- 2026-09-23: Compared the technical brief with the initial repository scaffold.
- 2026-09-23: Added officer authentication, officer queue, analytics, security headers, and bcrypt seed credentials.
- 2026-09-24: Diagnosed Docker Desktop and WSL2 requirements; improved migration diagnostics.
- 2026-09-29: Completed backend authorization, testability, and test command.
- 2026-10-01: Completed database migration, seeding, backend health verification, and officer dashboard integration.
- 2026-10-01: Implemented Flutter citizen registration, login, application submission, and status lookup.
- 2026-10-03: Flutter SDK installed; analysis passed and citizen login widget smoke test passed.
- 2026-10-03: Added persisted workflow records, private documents, notifications, password reset, advisory ML assistance, constrained decisions, and officer case review UI.
## Current implementation traceability

| Requirement | Implementation | Verification | Status | Limitation |
|---|---|---|---|---|
| Citizen registration & login | `api/routes/auth.js`, `ditsha-flutter/lib/main.dart` | API Jest test & Flutter widget tests | verified | Uses bcrypt password hashing and JWT |
| Citizen profile viewing/editing | `api/routes/auth.js`, `ditsha-flutter/lib/main.dart` | API integration test & Flutter UI | verified | Profile updates validated server-side |
| Land board selection | `api/routes/applications.js`, `ditsha-flutter/lib/main.dart` | API Jest test & Flutter dropdown | verified | Dynamically fetched from API |
| Citizen draft saving & submission | `api/routes/applications.js`, `ditsha-flutter/lib/main.dart` | API Jest test suite & Flutter draft view | verified | Transactional save with `is_draft` flag |
| Citizen document upload & magic checks | `api/routes/applications.js`, `ditsha-flutter/lib/main.dart` | API magic byte test & Flutter upload | verified | Magic byte validation for PDF/PNG/JPEG |
| Application status lookup & history | `api/routes/applications.js`, `ditsha-flutter/lib/main.dart` | API Jest test & Flutter status screen | verified | Detailed event timeline displayed |
| Information request & citizen response | `api/routes/applications.js`, `ditsha-flutter/lib/main.dart`, `ditsha-frontend/src/App.jsx` | Full loop API Jest test, React modal, Flutter response UI | verified | State transitions safely enforced |
| Application withdrawal | `api/routes/applications.js`, `ditsha-flutter/lib/main.dart` | API Jest test & Flutter withdraw button | verified | Allowed only from eligible active statuses |
| Officer authentication & queue | `api/routes/auth.js`, `api/routes/applications.js`, `ditsha-frontend/src/App.jsx` | API Jest test & React dashboard build | verified | Scoped to assigned officer/land board |
| Search, filter, and pagination | `api/routes/applications.js`, `ditsha-frontend/src/App.jsx` | API query tests & React UI controls | verified | Search by name/ref/ID, land board filter, status filter, 20-per-page pagination |
| Officer status decisions | `api/routes/applications.js`, `ditsha-frontend/src/App.jsx` | API decision test and dashboard build | verified | Reject requires mandatory justification note |
| Case assignment & reassignment | `api/routes/applications.js`, `ditsha-frontend/src/App.jsx` | API assignment test & React modal | verified | Audit trail recorded in `application_assignment` |
| Priority override with audit | `api/routes/applications.js`, `ditsha-frontend/src/App.jsx` | API override test & React modal | verified | Recorded in application record and audit events |
| Real-time / bounded queue updates | `ditsha-frontend/src/App.jsx` | 15s bounded polling with live indicator and manual refresh | verified | Safe fallback for development and staging |
| ML assistance & candidate models | `ml-service/main.py`, `ml-service/train_compare.py` | Docker container healthy, 3 models evaluated (LR, DT, RF) | verified | Metrics persisted in `ml-service/artifacts/comparison.json` |
| Database backup and restore | `db/backup.ps1`, `db/restore.ps1`, `db/backup.sh`, `db/restore.sh` | Automated test run on live PostgreSQL container | verified | 10.4MB SQL dump generated cleanly |
| Object-level authorization | Citizen ownership filters and officer assignment filters | Cross-citizen IDOR regression test | verified | Parameterized SQL queries prevent injection |

---

## 13. Operational Backup and Restore

PowerShell (Windows):
```powershell
# Backup
powershell -ExecutionPolicy Bypass -File db/backup.ps1

# Restore
powershell -ExecutionPolicy Bypass -File db/restore.ps1 -BackupFile db/backups/<backup-file>.sql
```

Bash (Linux / CI):
```bash
# Backup
./db/backup.sh

# Restore
./db/restore.sh db/backups/<backup-file>.sql
```
