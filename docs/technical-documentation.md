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

Local database settings are stored in `api/.env` and are intentionally excluded from source control. The current local connection is PostgreSQL on `localhost:5432`, database `ditsha`.

Migration:

```powershell
cd api
node migrate.js
```

The migration script loads `.env` relative to the API directory, so it works even when Node is started from the repository root.

## 4. Synthetic Data and QA Accounts

The Node seed script creates land boards, officers, citizens, and 1000 application records. It constrains generated phone values to the database limit and offsets application reference numbers when rerun.

The deterministic QA accounts are:

- Officer: `officer@example.com` / `OfficerPass123!`
- Citizen: `citizen@example.com` / `CitizenPass123!`

The deterministic officer receives 50 assigned applications for dashboard verification.

Seed:

```powershell
cd api
node seed.js
```

## 5. Backend API

The API runs on port `3000` by default.

Public endpoints:

- `GET /api/health`
- `POST /api/auth/citizen/register`
- `POST /api/auth/citizen/login`
- `POST /api/auth/officer/login`

Citizen endpoints:

- `POST /api/applications`
- `GET /api/applications/:id`

Officer endpoints:

- `GET /api/officer/applications?page=1&limit=20&status=all`
- `GET /api/officer/analytics/dashboard`

JWT role claims distinguish citizens from officers. Citizen application reads are scoped to the authenticated citizen. Officer queue and analytics results are scoped to the authenticated officer.

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

- Add a land-board listing endpoint for clients.
- Add full database-backed integration tests for login, submission, officer queue, and analytics.
- Add Flutter widget and integration tests.
- Add CI to run backend tests and frontend build on pull requests.
- Replace permissive development CORS with an explicit production allowlist.
- Add production secret rotation and backup procedures.

## 12. Change Log

- 2026-09-23: Compared the technical brief with the initial repository scaffold.
- 2026-09-23: Added officer authentication, officer queue, analytics, security headers, and bcrypt seed credentials.
- 2026-09-24: Diagnosed Docker Desktop and WSL2 requirements; improved migration diagnostics.
- 2026-09-29: Completed backend authorization, testability, and test command.
- 2026-10-01: Completed database migration, seeding, backend health verification, and officer dashboard integration.
- 2026-10-01: Implemented Flutter citizen registration, login, application submission, and status lookup.
- 2026-10-03: Flutter SDK installed; analysis passed and citizen login widget smoke test passed.
