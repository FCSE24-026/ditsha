Ditsha API

- Endpoints:
  - `POST /api/auth/citizen/register`
  - `POST /api/auth/citizen/login`
  - `POST /api/auth/officer/login`
  - `POST /api/applications` (JWT required)
  - `GET /api/applications/:id` (JWT required)
  - `GET /api/officer/applications` (officer JWT required; supports `page`, `limit`, and `status`)
  - `GET /api/officer/analytics/dashboard` (officer JWT required)
  - `GET /api/health`

  Follow `db/schema.sql` to create the database tables. Configure `.env` and run:

  ```powershell
  npm install
  node migrate.js
  node seed.js
  npm test
  npm run dev
  ```

  The seed creates deterministic QA accounts:

  - Officer: `officer@example.com` / `OfficerPass123!`
  - Citizen: `citizen@example.com` / `CitizenPass123!`

  Do not commit `.env`; use `.env.example` as the template.
