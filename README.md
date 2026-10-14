# Ditsha Backend (scaffold)

This scaffold contains:

- `db/schema.sql` - PostgreSQL schema for the sprint
- `api/` - minimal Node.js/Express API implementing auth and application endpoints
- `data-gen/` - Python script to generate 1000+ synthetic records
- `docs/technical-documentation.md` - living technical record from project start through current milestones

Quick start (local development):

1. Start PostgreSQL with Docker Compose:

```powershell
docker compose up -d db
```

   If another local PostgreSQL instance already uses port `5432`, stop it before starting Compose.
2. Copy `api/.env.example` to `api/.env` and set `DATABASE_URL` and `JWT_SECRET`.
3. In `api/` run:

```bash
npm install
node migrate.js
node seed.js --reset
npm run dev
```

The reset seed uses Botswana land boards, Tswana names, Botswana phone numbers, and creates the local QA accounts:

- Officer: `officer@example.com` / `OfficerPass123!`
- Citizen: `citizen@example.com` / `CitizenPass123!`

4. Generate synthetic data (adjust `DB_DSN` in `data-gen/generate_synthetic_data.py`):

```bash
python data-gen/generate_synthetic_data.py
```

## Production deployment baseline

The development Compose file intentionally exposes PostgreSQL and the ML service on
localhost. For a production-shaped local deployment, copy
`api/.env.production.example` to `api/.env.production`, provide a strong
`JWT_SECRET`, real database credentials, HTTPS frontend origins, and run:

```powershell
docker compose -f docker-compose.production.yml up -d --build
```

The production Compose file keeps PostgreSQL and ML on an internal network, runs
the API as a non-root Node user, applies migrations before startup, and includes
container health checks. Put a TLS reverse proxy or managed ingress in front of
the API; do not expose the API directly to the public internet without HTTPS.

Note: This is a minimal scaffold based on the technical brief. Continue implementation and add tests as needed.

Current implementation notes, startup commands, API contracts, client status, and follow-up work are maintained in `docs/technical-documentation.md`.
