# Ditsha API Contract

Base URL: `http://localhost:3000/api`

## Authentication

Citizen and officer login responses contain a JWT. Send it as:

```http
Authorization: Bearer <token>
```

## Endpoints

### Health

`GET /health`

Returns `{ "status": "ok", "timestamp": "...", "database": "connected" }`.

### Citizen registration

`POST /auth/citizen/register`

```json
{
  "national_id": "BW123456789",
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "password": "secret123",
  "phone": "+26776123456",
  "district": "Gaborone"
}
```

### Citizen login

`POST /auth/citizen/login`

```json
{ "email": "citizen@example.com", "password": "CitizenPass123!" }
```

### Submit application

`POST /applications` with a citizen JWT.

```json
{
  "application_type": "residential_allocation",
  "land_board_id": "<land-board-uuid>",
  "description": "Application for a residential plot"
}
```

### Land boards

`GET /land-boards`

Returns the Botswana land boards available for a citizen application:

```json
{
  "land_boards": [
    {
      "land_board_id": "<uuid>",
      "name": "Ngwato Land Board",
      "district": "Central District",
      "region": "Serowe"
    }
  ]
}
```

### View application

`GET /applications/:id` with the owning citizen JWT.

### Officer login

`POST /auth/officer/login`

```json
{ "email": "officer@example.com", "password": "OfficerPass123!" }
```

### Officer queue

`GET /officer/applications?page=1&limit=20&status=all&sortBy=submitted_at&sortOrder=desc`

The response includes `citizen_name`, `reference_number`, `application_type`, `current_status`, and `submitted_at`.

### Update application status

`POST /officer/applications/:id/status` with an officer JWT.

```json
{
  "status": "under_review",
  "notes": "Documents received and ready for review"
}
```

Allowed statuses are `submitted`, `under_review`, `approved`, and `rejected`. Every update is recorded in `application_event`.

### Officer analytics

`GET /officer/analytics/dashboard` with an officer JWT.

Returns assigned totals, average approved processing days, and counts by status.

## Error conventions

- `400`: missing or invalid request fields.
- `401`: missing or invalid JWT credentials.
- `403`: valid token with the wrong role or ownership.
- `404`: application not found for the authenticated citizen.
- `500`: unexpected server or database failure.