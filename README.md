# Ditsha Backend (scaffold)

This scaffold contains:

- `db/schema.sql` - PostgreSQL schema for the sprint
- `api/` - minimal Node.js/Express API implementing auth and application endpoints
- `data-gen/` - Python script to generate 1000+ synthetic records
- `docs/technical-documentation.md` - living technical record from project start through current milestones

Quick start (local development):

1. Create a Postgres database and run `db/schema.sql` to create tables.
2. Copy `api/.env.example` to `api/.env` and set `DATABASE_URL` and `JWT_SECRET`.
3. In `api/` run:

```bash
npm install
npm run dev
```

4. Generate synthetic data (adjust `DB_DSN` in `data-gen/generate_synthetic_data.py`):

```bash
python data-gen/generate_synthetic_data.py
```

Note: This is a minimal scaffold based on the technical brief. Continue implementation and add tests as needed.

Current implementation notes, startup commands, API contracts, client status, and follow-up work are maintained in `docs/technical-documentation.md`.
