# Ditsha API Contract

Base URL: `http://localhost:3000/api`

## Authentication

Citizen and officer login responses contain a JWT token. Send it in headers as:

```http
Authorization: Bearer <token>
```

---

## Citizen Endpoints

### 1. Registration
`POST /auth/citizen/register`
```json
{
  "national_id": "BW123456789",
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "password": "CitizenPass123!",
  "phone": "+26776123456",
  "district": "Gaborone"
}
```

### 2. Login
`POST /auth/citizen/login`
```json
{
  "email": "citizen@example.com",
  "password": "CitizenPass123!"
}
```

### 3. Profile Management
- `GET /auth/citizen/me` - View authenticated citizen profile.
- `PUT /auth/citizen/me` - Update profile:
```json
{
  "full_name": "Jane Citizen Doe",
  "phone": "+26771234567",
  "district": "Francistown"
}
```

### 4. Password Reset
- `POST /auth/citizen/password-reset/request`
```json
{
  "email": "citizen@example.com"
}
```
- `POST /auth/citizen/password-reset/complete`
```json
{
  "token": "<reset-token>",
  "new_password": "NewCitizenPass123!"
}
```

### 5. Land Boards
`GET /land-boards`
Returns available Botswana land boards.

### 6. Applications & Drafts
- `POST /applications/draft` - Save an application draft:
```json
{
  "application_type": "residential_allocation",
  "land_board_id": "<land-board-uuid>",
  "description": "Plot draft notes",
  "draft_id": "<optional-existing-draft-uuid>"
}
```
- `GET /applications/drafts` - List citizen drafts.
- `POST /applications` - Submit an application (either new or converting draft):
```json
{
  "application_type": "residential_allocation",
  "land_board_id": "<land-board-uuid>",
  "description": "Application for a residential plot",
  "draft_id": "<optional-draft-uuid>"
}
```
- `GET /applications` - List citizen's submitted applications.
- `GET /applications/:id` - Detailed application status, timeline, notes, and uploaded documents.
- `POST /applications/:id/withdraw` - Citizen voluntary withdrawal of an active application:
```json
{
  "reason": "Plot allocated elsewhere"
}
```
- `POST /applications/:id/respond` - Citizen response to officer information request:
```json
{
  "response": "Here is the updated proof of residence as requested."
}
```

### 7. Documents
- `POST /applications/:id/documents` - Multipart file upload (`document_type`, file binary). Enforces file signature validation (PDF, JPEG, PNG) to prevent MIME spoofing.
- `GET /applications/:id/documents` - List documents for the application.
- `GET /applications/:id/documents/:docId` - Authorized document stream/download.

### 8. Notifications
- `GET /notifications` - List citizen in-app notifications.
- `POST /notifications/:id/read` - Mark notification as read.

---

## Officer Endpoints

### 1. Login
`POST /auth/officer/login`
```json
{
  "email": "officer@example.com",
  "password": "OfficerPass123!"
}
```

### 2. Applications Queue & Filtering
`GET /officer/applications?page=1&limit=20&status=all&land_board_id=<uuid>&search=<query>&sortBy=submitted_at&sortOrder=desc`

Returns paginated queue with metadata, search matches across applicant name, national ID, and reference number, filtered by status and land board scope.

### 3. Application Details
`GET /officer/applications/:id`
Returns full case record, applicant details, status history, notes, documents, and assignment info.

### 4. Status Decisions
`POST /officer/applications/:id/status`
```json
{
  "status": "under_review",
  "notes": "Commencing technical review."
}
```
Valid state transitions:
`submitted` -> `under_review` -> `approved` | `rejected`
`submitted` | `under_review` -> `information_requested` -> `under_review`
`submitted` | `under_review` -> `withdrawn` (citizen action)

### 5. Request Additional Information
`POST /officer/applications/:id/request-info`
```json
{
  "message": "Please attach an updated affidavit of plot non-ownership."
}
```

### 6. Case Assignment
`POST /officer/applications/:id/assign`
```json
{
  "officer_id": "<officer-uuid>",
  "notes": "Reassigned for specialized boundary survey."
}
```

### 7. Priority Override
`POST /officer/applications/:id/override-priority`
```json
{
  "priority_score": 95.0,
  "reason": "Court-ordered expedite."
}
```

### 8. Officer Notes
`POST /officer/applications/:id/notes`
```json
{
  "note": "Survey marks verified on topographical grid map."
}
```

### 9. Operational Analytics
`GET /officer/analytics/dashboard`
Returns queue counts by status, average processing durations, and assigned counts.

---

## ML Assistance Service Endpoints

Base URL: `http://localhost:8000`

### 1. Health & Readiness
- `GET /health` -> `{"status": "ok", "service": "ditsha-ml"}`
- `GET /ready` -> `{"status": "ready", "model_version": "rules-1"}`

### 2. Completeness & Priority Assessment
`POST /assess`
```json
{
  "application_id": "<uuid>",
  "application_type": "residential_allocation",
  "fields": {
    "district": "Gaborone",
    "description": "Plot application",
    "land_board_id": "<uuid>"
  },
  "documents": ["national_id", "proof_of_residence"]
}
```
Response:
```json
{
  "application_id": "<uuid>",
  "completeness_score": 1.0,
  "is_complete": true,
  "missing_fields": [],
  "missing_documents": [],
  "priority_score": 55.0,
  "priority_breakdown": {
    "age_component": 0.0,
    "completeness_component": 40.0,
    "workload_component": 15.0
  },
  "anomaly_flags": [],
  "model_version": "rules-1.1",
  "created_at": "2026-10-18T12:00:00Z"
}
```

---

## Error Handling Conventions

- `400 Bad Request`: Missing required fields, invalid format, or disallowed status transition.
- `401 Unauthorized`: Missing, invalid, or expired JWT token.
- `403 Forbidden`: Token does not have permission (e.g., citizen accessing officer routes or accessing another citizen's case).
- `404 Not Found`: Resource or application not found.
- `500 Internal Server Error`: Server failure with structured error envelope.