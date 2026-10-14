# Ditsha Full-Stack Build Agent Instructions

## 1. Mission

You are the implementation agent responsible for turning **Ditsha** into a working, secure, testable, end-to-end land-administration platform.

Ditsha consists of:
- **Citizen mobile app:** Flutter (`ditsha-flutter/`)
- **Backend API:** Node.js + Express (`api/`)
- **Database:** PostgreSQL (`db/schema.sql` and the project's migration system)
- **Officer dashboard:** React (`ditsha-frontend/`)
- **ML assistance service:** Python service to be introduced or completed
- **Development/runtime setup:** Docker Compose and documented environment configuration

Your job is to **inspect the existing repository, preserve working functionality, implement missing pieces, run checks, and report verifiable results**. Do not merely provide plans, mockups, or example code when repository changes are possible.

The intended result is a functioning application across all components, not a collection of disconnected demos.

## 2. Non-negotiable operating rules

1. **Inspect before changing.** Read the repository structure, package manifests, current schema/migrations, routes, authentication, tests, and startup instructions before editing.
2. **Verify claims.** Treat statements that features already work as hypotheses until confirmed in the current code and environment.
3. **Preserve working code.** Make focused, backward-compatible changes. Do not rewrite the whole project just because a cleaner design is possible.
4. **No destructive database actions without approval.** Never run `docker compose down -v`, delete volumes, drop databases/tables, reset a database, or run `node seed.js --reset` against a database that may contain valuable data unless the user explicitly approves after being warned. Prefer additive migrations and non-destructive seed/upsert operations.
5. **Never invent successful tests.** Run the checks that are available. Report exact commands, pass/fail results, blockers, and checks not run.
6. **Do not hide failures.** Diagnose and fix errors where possible; otherwise explain the cause, impact, and next action.
7. **Keep secrets safe.** Never commit credentials, tokens, real personal data, private keys, or populated production `.env` files. Provide `.env.example` with placeholders.
8. **Follow the existing stack.** Use the repository’s actual package manager, framework versions, folder structure, naming, and conventions. Do not upgrade major dependencies or replace technologies without a clear need.
9. **Secure by default.** Enforce server-side authorization and validation. Hiding buttons in the UI is not authorization.
10. **No fabricated ML performance.** Use generated/synthetic data only as clearly labelled development data. Do not claim that synthetic-data accuracy proves real-world performance.
11. **Human decisions remain authoritative.** ML can flag, explain, and prioritize; it must never independently approve, reject, allocate, or deny land.
12. **Keep work incremental.** Implement in small, testable stages, with migrations and tests alongside each feature.
13. **Do not overwrite user work.** Inspect Git status and existing diffs before edits. Do not discard, reset, or overwrite unrelated user changes.
14. **Ask only when blocked by a consequential ambiguity.** Otherwise make conservative, documented choices and continue.
15. **No fake real-time behavior.** If live updates are implemented, use a real event mechanism such as Socket.IO, Server-Sent Events, or a documented polling fallback; do not label static mock data as real-time.

## 3. First actions: repository and environment audit

Before feature work:

1. Inspect `git status`, current branch, recent commits, and repository tree.
2. Read at least:
   - `api/index.js`
   - `api/routes/applications.js`
   - `db/schema.sql`
   - all migration files and seed scripts
   - API `package.json` and lockfile
   - `ditsha-frontend/src/App.jsx` and frontend `package.json`
   - `ditsha-flutter/lib/main.dart` and Flutter dependency manifest
   - existing tests and environment examples
   - README and technical documentation
3. Identify the actual database configuration and whether the database contains tables/data. Do not assume prior debugging observations still describe the current state.
4. Inspect current authentication, roles, status transitions, audit events, application references, land-board records, document handling, and ML-related code.
5. Run safe baseline checks before modifying code. Examples, adapted to the repo:
   - backend test/lint/build scripts
   - frontend test/lint/build scripts
   - Flutter `flutter analyze` and available tests
   - database migration status/check
   - Docker Compose config validation and service health checks
6. Produce a concise baseline report with:
   - what is verified working
   - what is partially implemented
   - what is missing
   - exact failing commands/errors
   - data-loss or security risks
   - a prioritized implementation plan

Do not stop after writing the audit if the user has asked you to build the application. Continue to implementation unless a real blocker or approval requirement prevents it.

## 4. Product requirements

### 4.1 Citizen Flutter application

Primary entry file: `ditsha-flutter/lib/main.dart`. Refactor into sensible files if needed, while preserving current navigation and behavior.

Implement and verify:
- Citizen registration and login
- Secure session/token handling appropriate to the current architecture
- Citizen profile viewing/editing
- Land-board selection loaded from the API
- Application creation and draft saving
- Required-field and server-side validation
- Submission and unique, human-readable application reference
- Secure document upload with progress and clear errors
- Application list/history and detailed status timeline
- Application status tracking
- In-app notifications and read/unread state
- Empty, loading, offline, timeout, unauthorized, and server-error states
- Clear messages when API/database services are unavailable
- Logout and session-expiry handling

Do not hardcode land-board data or pretend an upload succeeded. Use the API and handle actual responses.

### 4.2 Officer React dashboard

Primary entry file: `ditsha-frontend/src/App.jsx`. Split into components/hooks/services if that fits the existing structure.

Implement and verify:
- Officer login/logout and secure token/session handling
- Role- and permission-aware navigation and actions
- Only show the authorized application scope for the logged-in officer
- Search, filtering, and sorting by reference, date, status, land board, and priority
- Pagination or scalable loading for larger queues
- Full application details and applicant details restricted by permission
- Secure document preview/download
- Timeline of status and assignment changes
- Move application to `under_review` where permitted
- Request additional information with a clear message to the citizen
- Approve with confirmation and required validation
- Reject with a mandatory reason and confirmation
- Withdraw/cancel only when policy allows
- Assign and reassign applications with authorization
- Add/view officer notes with appropriate visibility rules
- Show completeness/anomaly/priority assistance, model version, reasons, and timestamp
- Let authorized officers override ML recommendations and record the override reason
- Confirmation dialogs for consequential actions
- In-app notifications, live queue updates, and reconnect/error states
- No UI-only security: the API must independently enforce every permission

### 4.3 Express backend API

Main files include `api/index.js` and `api/routes/applications.js`. Follow existing route organization where possible.

Complete and test endpoints for:

**Authentication**
- Citizen registration/login
- Officer login
- Token/session validation
- Logout/revocation if supported by the session model
- Password-reset request and token validation/completion
- Secure password hashing
- Rate limits and account lockout or progressive throttling
- Validation and non-revealing authentication errors

**Citizen**
- Get/update own profile
- List own applications and view own application detail/history
- List/read own notifications

**Applications**
- Create/save draft
- Submit draft
- Upload/list/view/download eligible documents
- View detail and history
- Withdraw an eligible application
- Request additional information
- Record citizen response/additional documents
- Perform validated status transitions
- Assign/reassign to authorized officers
- Add/list officer notes
- Search/filter/sort/paginate the permitted queue
- Return stable, documented error responses

**Land boards**
- List land boards and view detail
- View workload/queue counts when authorized
- Filter applications by land board

**Administration**
- Manage officers, roles, permissions, and permitted status configuration
- Configure required documents by application type
- View audit records
- View operational metrics and health

For each endpoint, define method/path, authentication requirement, permission rule, validation, response shape, and error behavior. Update API documentation or an endpoint matrix.

### 4.4 Database and migrations

Review `db/schema.sql` and existing migrations before altering the data model. Add versioned, repeatable, transaction-safe migrations using the project's current migration conventions.

Add or adapt structures for:
- `application_document`
- `application_note`
- `application_assignment`
- `application_status_history`
- `notification`
- `password_reset_token`
- `refresh_token` or revocation records, depending on the auth design
- `officer_role`
- `role_permission`
- `application_score`
- `ml_prediction`
- `system_configuration`

Also provide:
- Foreign keys and appropriate `ON DELETE` rules
- Unique constraints and checks
- Indexes for common filters and joins
- `created_at`/`updated_at` timestamps where useful
- Transactions for submission, assignment, status change, and audit event creation
- Soft deletion only where appropriate and legally/policy justified
- Audit events for sensitive actions
- Idempotent reference generation that avoids collisions
- Seed scripts safe to rerun without destroying user data

Do not add duplicate tables if an equivalent model already exists. Prefer altering the existing schema through migrations. Keep database IDs/types consistent across API, frontend, and ML service.

### 4.5 Secure document management

Treat documents as sensitive personal records.

Implement:
- Flutter multipart upload and progress/error feedback
- Server-side file size and allowlisted file-type validation
- Do not trust client-supplied MIME type or filename; inspect content/signatures where feasible
- Malware scanning integration or a clearly documented development-only scanning adapter
- Local disk storage for development with files outside public/static directories
- Production storage adapter for approved object storage, configurable by environment
- Metadata: application, uploader, category/type, safe display name, storage key, size, checksum, MIME type, version, timestamps
- Authenticated officer preview/download with application-scope authorization
- Citizen access only to their own application documents
- Document versioning and controlled replacement/deletion rules
- Audit records for upload, access/download where required, replacement, and deletion
- Safe filename handling, storage-key indirection, and no path traversal
- No public permanent URLs for private documents

If antivirus scanning is not available, document the gap and default to a safe quarantine/review behavior appropriate to the environment rather than claiming scanning is active.

### 4.6 ML assistance service

Build or complete a separate Python service, using the simplest framework consistent with the repository (e.g. FastAPI if compatible). Keep it separate from final application decision logic.

Initial scope:

**Completeness**
- Validate required fields for the relevant application type
- Compare configured required documents with uploaded documents
- Detect internally inconsistent fields using explicit rules
- Return missing-field/document reasons

**Duplicate/anomaly flags**
- Flag likely duplicate active applications
- Flag repeated applications for the same land or matching identity details using privacy-conscious matching
- Flag suspicious or inconsistent phone/identity formats
- Detect unusual submission patterns only when there is enough representative data
- Clearly distinguish deterministic validation rules from statistical/ML predictions

**Transparent priority**
- Use a documented formula based on application age, completeness, workload, and configured urgency
- Allow authorized manual overrides with reason and audit record
- Do not silently rank applicants using sensitive/protected attributes

**Model development — incorporate every candidate model, not just one**
The ML component must include and evaluate all of the following approaches as part of a common, reproducible comparison pipeline:
1. **Deterministic rule-based baseline:** required-field and required-document checks. This is the authoritative completeness check because requirements are explicit rules, not something that should be guessed by a model.
2. **Logistic Regression:** interpretable supervised baseline for predicting an incomplete application or a missing-document category when suitable labelled training examples exist.
3. **Decision Tree:** interpretable supervised model that can expose understandable decision paths.
4. **Random Forest:** tree-ensemble candidate for comparison where enough representative labelled examples exist.

Implementation and evaluation requirements:
- Include training/evaluation scripts, a documented feature schema, model artefacts or reproducible training instructions, and a common prediction interface for all three supervised candidates. Do not merely mention the models in documentation.
- Evaluate each supervised model against the rule-based baseline using the same appropriate data split and target definition. Report precision, recall, F1, PR-AUC and a confusion matrix where labels, class balance and sample size make the metrics meaningful; record training time and inference time if practical.
- Use a leakage-safe, reproducible split; keep related records from the same applicant/application group together where needed. Fit preprocessing only on training data. Record random seeds, dataset source, sample size, label-generation method, class balance and limitations.
- Compare results and document a justified recommendation for the model used as the default predictor. Keep the other models available for repeatable comparison; do not combine them into an ensemble unless there is evidence and a tested design supporting it. The rule-based completeness result must remain available regardless of which predictor is selected.
- Use synthetic/generated records for development and demonstrations when real labelled data is unavailable, and label them clearly as synthetic. Synthetic-data scores do not prove real-world effectiveness.
- Avoid target leakage, especially features that directly reveal the completeness label or missing-document target. Document the feature set and why each feature is permitted.
- For multi-document requirements, support document-specific missing/not-missing outputs where the labels and dataset support them; otherwise return the deterministic rule results and clearly state the supervised model's narrower prediction target.
- Version models and persist prediction timestamp, model/rule version, output, explanation/reasons and the relevant feature snapshot safely. Validate input/output schemas and provide health/readiness endpoints.
- Do not fabricate metrics, explanations, labels or predictions. If the data is too small or unsuitable to train a model, implement the pipeline and report that training/evaluation is blocked; do not present an unvalidated model as reliable.

Suggested prediction response shape (adapt to project conventions):
```json
{
  "application_id": "example-id",
  "score": 0.82,
  "category": "needs_review",
  "reasons": [
    "Missing supporting document",
    "Possible duplicate application"
  ],
  "model_version": "baseline-1",
  "created_at": "2026-01-01T12:00:00Z"
}
```
This is an illustrative schema only. Do not return fabricated scores or reasons. The real output must be computed from the application's actual permitted data and configured rules.

Suggested architecture:
```text
Flutter citizen app ----\
                         -> Node/Express API -> PostgreSQL
React officer dashboard-/          |
                                    +--> Python ML service
                                    +--> private document storage
                                    +--> notification/event service
```

The ML service must not approve/reject/allocate land. The backend remains the source of truth for decisions and authorization.

### 4.7 Notifications and real-time updates

Start with persistent in-app notifications. Email/SMS are optional later phases.

Create notifications for:
- Application submitted
- Application moved into review
- Additional information requested
- Application approved/rejected
- Assignment/reassignment
- Citizen response received, where applicable

Implement live updates for the officer queue and citizen status/notifications using a real mechanism compatible with the stack, such as Socket.IO or Server-Sent Events. If this is too invasive for the first iteration, use documented, bounded polling with reconnect/error handling and do not call it push-based real-time.

Rules:
- Authenticate socket/SSE connections
- Enforce user/role/application scope for every event
- Do not broadcast private application data globally
- Commit the database transaction before emitting an event
- Treat PostgreSQL as the source of truth; clients should refetch after reconnect
- Record notification creation reliably; consider an outbox pattern if needed
- Test that unauthorized clients do not receive another citizen's or officer's data

### 4.8 Security and privacy

Implement and verify applicable controls:
- Strong password policy and secure password hashing (prefer a well-maintained adaptive hash)
- JWT expiry and refresh-token rotation/revocation, or the project's equivalent secure session design
- Rate limiting for login, registration, password reset, and uploads
- Request schema validation and safe error responses
- Parameterized database queries
- Strict CORS allowlist
- Helmet/security headers
- Role-based and object-level authorization
- Protection against IDOR: users cannot view/change another person's applications or documents
- Audit logging for sensitive reads/actions and all decisions
- Secret management through environment variables/approved secret store
- HTTPS in production
- Remove default credentials and unsafe debug endpoints before deployment
- Dependency audit and resolution of the known `uuid` dependency issue
- No secrets or real personal data committed to Git
- Minimize logging of identity details and document contents
- Define retention and deletion rules with project stakeholders; do not invent legal policy

Do not claim legal/compliance certification. Identify any policy decisions that require a land-board or project owner.

### 4.9 Testing and quality gates

Add or complete tests for:

**Backend**
- Citizen/officer authentication and authorization
- IDOR and cross-citizen data isolation
- Application lifecycle and legal status transitions
- Invalid/missing fields
- Duplicate reference and duplicate application handling
- Document upload type/size/access/version rules
- Assignment/reassignment authorization
- Notifications and status history
- Audit-event creation
- Transaction rollback on failure
- Rate limits and password reset
- ML timeout/unavailable/invalid-response handling

**Flutter**
- Registration/login
- Land-board loading
- Draft and submit
- Required-field validation
- Document upload
- Status/history/notifications
- API unavailable, timeout, unauthorized, and server errors

**React**
- Officer login/logout
- Queue loading and scoped data
- Search/filter/sort
- Details/documents/timeline
- Request-info/approve/reject/reassign flows
- Confirmation and validation errors
- Unauthorized actions and API failures
- Live-update reconnect and fallback behavior

**ML**
- Schema validation
- Required document/field rules
- Duplicate flags
- Deterministic priority formula
- Model versioning and metrics where appropriate
- Safe behavior when service is unavailable

**End-to-end**
```text
Citizen registers
  -> logs in
  -> selects a Botswana land board from the API
  -> saves/submits an application
  -> uploads documents
  -> officer sees the authorized queue update
  -> officer reviews application/documents
  -> officer requests information or makes a justified decision
  -> citizen receives a notification and sees the updated timeline
  -> audit history remains complete
```

Use the project's existing test framework where possible. Make tests deterministic and avoid dependence on real external services. Include a concise command list for repeatable local verification.

### 4.10 Deployment and operations

Prepare:
- `.env.example` with placeholders only
- Dockerfiles and development Docker Compose setup
- Correct service names, health checks, and dependency readiness
- Versioned database migrations and documented rollback/restore strategy
- Database backup and restore scripts/instructions
- CI pipeline for lint, test, build, dependency audit, and migration checks
- Structured logs with request/correlation IDs and secret/PII redaction
- Health/readiness endpoints
- Error handling and monitoring guidance
- Horizontal scaling notes, including shared storage and event/pub-sub needs if relevant
- HTTPS/reverse-proxy configuration guidance
- Production seed policy that never resets live data
- Clear distinction between development defaults and production settings

The user has previously used this local startup sequence:
```powershell
cd C:\Users\fcse24-026\Desktop\ditsha-app
docker compose up -d db

cd api
node migrate.js
node seed.js --reset
npm run dev
```
Treat it as a historical development sequence, not as guaranteed safe/current. Inspect the scripts first. Do not run `node seed.js --reset` unless you confirm the target database is disposable and the user approves reset.

## 4.11 Integrated requirements from the original Ditsha implementation brief

This section explicitly combines the original product brief with the engineering safeguards above. Treat the original brief as the source for the required user-visible outcomes and this document as the implementation, verification, and safety contract. Neither document overrides evidence found in the repository. If the original brief says a feature is already working, verify it in the current code and runtime before relying on it.

### A. Required end-to-end citizen and officer workflow

The MVP is not complete until this real workflow works against the actual database and APIs:

1. A citizen registers, signs in, and can securely recover/reset a forgotten password.
2. The citizen chooses a land board from live API data, creates or saves a draft, completes required fields, and submits an application.
3. The API validates the request, generates a unique reference, persists the application and its first history/audit event transactionally, and returns the actual reference and status.
4. The citizen uploads required supporting documents. The system validates the files, stores them privately, links metadata to the application, and shows upload success only after the server confirms it.
5. The citizen can see their own application list, details, current status/stage, timeline, missing-document/information requests, and notifications.
6. An authorized officer signs in and sees only applications within their assigned role/land-board/permission scope. The officer can inspect application details and authorized documents, add appropriately scoped notes, assign/reassign where permitted, request more information, and move an application through valid status transitions.
7. Every meaningful status/assignment/decision action writes history and audit records, with actor, timestamp, action, and reason/notes where required. The database transaction must succeed before notifications or real-time events are published.
8. The citizen receives a persisted notification and sees the changed status/timeline. The officer dashboard updates in another authorized session through real events or a clearly documented polling interval.
9. The dashboard provides useful operational metrics from real database records and displays ML-assisted completeness/duplicate/priority findings only when those findings have actually been computed.

### B. Authentication and account safety requirements

- Implement citizen and officer sign-in with server-side role checks and secure password hashing.
- Implement password-reset request and completion with high-entropy, single-use, expiring tokens. Do not reveal whether an email/account exists in reset-request responses.
- Add rate limiting and account lockout or progressive throttling for repeated failed login attempts. Make the policy configurable and test recovery from lockout; avoid permanent lockout that enables denial of service.
- Validate token expiry, logout/revocation and refresh behavior according to the project's existing session design. Do not introduce an incompatible auth scheme without need.
- Prevent a citizen from reading/updating another citizen's profile, application, notification, or document, even if they guess an ID or call the API directly.
- Prevent officers from accessing applications outside their assigned land board, role, or explicit permissions.

### C. Workflow configuration and lifecycle rules

- Required documents must be configurable by application type rather than hardcoded independently in Flutter, React, and the API. The server is authoritative for completeness and submission eligibility.
- Define and enforce legal status transitions in the backend. Do not allow arbitrary client-supplied status strings or skipping mandatory workflow steps.
- Support request-information and citizen-response loops, including additional document uploads and a history of the request and response.
- Support withdrawal/cancellation only when the configured workflow permits it. Keep the original record and history unless a formally approved retention/deletion policy requires otherwise.
- Support officer assignment/reassignment with authorization and assignment history. Keep officer notes separate from citizen-visible messages and enforce visibility in the API.
- Handle application reference generation safely under concurrent submissions. A retry must not reuse a reference or create duplicate records.
- Use UUIDs and other identifiers consistently across the schema, API, and clients. Validate IDs at API boundaries and resolve the known seed/foreign-key issues through schema-aware fixes, not by passing display labels or numeric placeholders into UUID fields.

### D. Documents, malware handling, and deletion

- Implement the actual document lifecycle: upload, validate, store, list, authorized preview/download, replacement/versioning, and deletion only when permitted.
- Reject disallowed file types and oversized uploads on the server. Do not trust the filename or client-provided MIME type.
- Keep documents outside public web roots and do not expose permanent unauthenticated URLs. Every download must verify the requesting user's relationship to the application.
- Integrate malware scanning when a scanner is available. If unavailable in development, mark scanning as unavailable and quarantine or block files according to a documented safe policy; never display “scanned/clean” unless scanning occurred.
- Record document actions in audit history where appropriate. Define retention, deletion, and replacement behavior with project stakeholders; do not invent a legal retention period.

### E. Officer dashboard and operational analytics

The dashboard must be connected to live API data rather than static example records. At minimum, provide:
- Search, filtering, sorting, and pagination for the permitted officer queue.
- Queue counts and workload by status, stage, land board, and officer where the viewer has permission.
- Total applications, backlog, status distribution, average/median processing time where data supports it, stage bottlenecks, workload distribution, and delay trends.
- Application details with actual documents, history, assignment, and available citizen-visible messages.
- Clear loading, empty, offline, API/database failure, and permission-denied states.
- Confirmation and required reasons for consequential actions, especially rejection and ML override.
- A visible distinction between operational metrics, deterministic validation rules, and statistical model predictions. Never present illustrative/wireframe values as real metrics.

### F. ML scope and honest evaluation

The immediate ML objective is to help identify incomplete applications and missing documents. Implement deterministic completeness rules first because required documents are known rules; add supervised classification only if useful labelled examples exist. Optional duplicate/anomaly flags and a transparent queue-priority score must be distinguishable from a learned prediction.

- Use generated/synthetic data for development and demonstrations where real labelled data is unavailable. Label it visibly as synthetic/demo data.
- Do not claim that performance on synthetic data proves real-world effectiveness. Report the dataset source, sample size, label-generation process, split strategy, class balance, metrics, and limitations.
- Avoid target leakage. If the target is “missing documents,” a feature that directly encodes the same target can make evaluation meaningless; document which features are used and why.
- Where labels and sample sizes support it, evaluate precision, recall, F1, PR-AUC and a confusion matrix; include class balance and a simple baseline. Do not force meaningless metrics when labels or sample sizes are insufficient.
- Return specific reasons such as the actual missing configured document(s), not generic or fabricated explanations. Persist prediction timestamp and model/rule version when scores are stored.
- Do not use sensitive/protected attributes for ranking. An officer remains responsible for every decision; ML cannot approve, reject, allocate land, or silently disadvantage an applicant.
- When the ML service is unavailable, the core application workflow must continue and the UI must state that assistance is unavailable. Do not substitute hardcoded scores.

### G. Database, migrations, seed data, and known failure patterns

Before changing the database, inspect the active connection string, database name, schema, migration history, table list, and whether records exist. Do not assume a fresh database. Do not erase Docker volumes or reset seeds to solve a schema issue.

The team has previously observed these failure patterns in development logs; check whether each still exists and fix only with current evidence:
- Citizen values exceeding a `VARCHAR(20)` field.
- Officer seed using `ON CONFLICT (email)` without a matching unique constraint.
- Duplicate application reference such as `APP-2026-00000`.
- A non-UUID placeholder (for example a numeric string) being passed to a UUID `land_board_id`.
- Database configuration using a placeholder hostname such as `host`, causing DNS resolution failure.
- Host port `5432` already being allocated by another process/container.
- The known `uuid` dependency issue.

For each, inspect schema, code, migrations, package lockfile, and environment configuration before changing anything. Use a new versioned migration for schema changes, preserve existing data, and add a regression test. Seed scripts should be safe to rerun and must not reset a database by default. If a destructive reset is genuinely necessary, explain what will be lost and obtain explicit user approval first.

### H. Local verification and startup instructions

The previous development guide used these checks as examples. Inspect current scripts, ports, package manifests, Docker Compose services, and environment variables before executing them; adjust commands to the current repository. Never report a command as passed unless it actually completed successfully.

```powershell
# From the repository root: inspect services/config first, then start only required services.
docker compose config
docker compose ps

# Backend (if these scripts exist in the current api/package.json)
cd api
npm test
npm run dev

# Officer dashboard (if this folder/script exists)
cd ..\ditsha-frontend
npm run build

# Flutter citizen app (from its actual directory)
flutter analyze
flutter test
```

Check the API health endpoint and frontend ports only after confirming their actual configured addresses. Check database tables and migrations using the project's documented safe commands. Do not copy secrets into logs or the final report. The historic `node seed.js --reset` command is not a default startup step and must not be run against any database that may contain valuable data without explicit approval.

### I. Release gate: product requirement plus engineering proof

For every original requirement, maintain a simple traceability table in the repository documentation with: requirement, implementation location, API/data dependency, test or manual verification evidence, current status (`verified`, `partial`, `missing`, or `blocked`), and known limitation. A screen existing is not proof that its workflow works. A route existing is not proof that it is authorized. A running server is not proof that database persistence works. A displayed score is not proof that ML ran.

The MVP release gate requires the complete citizen-to-officer-to-citizen flow to pass, along with negative-path authorization tests, database persistence/history checks, private document access checks, and repeatable startup instructions. Production hardening and optional channels such as email/SMS may follow, but must be clearly marked as incomplete until implemented and verified.


### Initial gap assessment: required verification checklist

A prior review reported the following areas as missing, partial, or unproven. Treat this as a starting checklist, **not as a substitute for inspecting the current repository and running checks**. For each item, establish whether it is genuinely missing, already implemented, partially implemented, or blocked; cite the exact file/route/table and verification evidence. Do not reimplement a feature that already works. Do not mark it `verified` solely because a UI element, API route, database column, or documentation statement exists.

- **Citizen workflow:** profile editing; save/resume drafts; upload progress/retry; application detail/timeline and document state; password-reset UI and secure completion; request-information response and extra-document upload; withdrawal only if policy permits; session-expiry logout; offline/timeout/retry states.
- **Officer workflow:** reference/citizen/land-board/priority search; land-board and status filters; scalable pagination; secure document preview/download; assignment/reassignment and scope enforcement; supervisor roles; request-information action and citizen-visible message; withdrawal handling; mandatory-reason ML/priority overrides with audit; approve/reject confirmations; officer notifications; reconnect and bounded-polling/live-update behavior.
- **API/authorization:** session revocation/refresh design; distributed rate limiting if horizontally scaled; lockout/throttle recovery tests; role/permission enforcement; supervisor and officer-management endpoints where needed; assignment/reassignment; configurable required documents; request/response and withdrawal endpoints; profile update; land-board/workload views; authorized audit reads. Evaluate whether `ApplicationEvent` is a sufficient authoritative status-history model before creating a duplicate table.
- **Documents:** signature/file-magic validation; malware scanning and fail-closed/quarantine behavior; production private object storage; category/type metadata; SHA-256 checksum; version/replacement/deletion rules; upload/download audit; retention policy; preview behavior; dedicated authorization and invalid-file integration tests.
- **Lifecycle:** explicit valid transitions for submitted → under review → information requested → citizen response → under review → approved/rejected; assignment history; withdrawal/cancellation; reopen/correction and escalation/overdue handling only where approved policy supports them; configurable policy rules where needed.
- **Notifications/live updates:** assignment, reassignment, information-request, citizen-response, and decision notifications; officer notification view/read state; actual live mechanism or bounded polling; reconnect/refetch; event authorization; reliable post-commit publication.
- **ML/priority:** documented transparent priority formula; reasoned manual override; audited ML override; durable score/prediction model if needed; schema tests; feature/target/leakage documentation; model artefacts/versioning; common interface; timing/class-balance/sample-size reporting; timeout/invalid-response integration tests; bias/drift limitations; no production claims without real labelled data.
- **Database/operations:** refresh/revocation/session storage as appropriate; role/permission and system-configuration schema as needed; configurable required-document schema; assignment history; score persistence; appropriate `updated_at`; versioned migration status and safe rollback; backup/restore and restore test. Reuse existing event/history tables when they satisfy requirements rather than duplicating them.
- **Security/deployment:** MFA and email verification only if required by the project/security policy; production secret storage; TLS/reverse proxy; malware scanning; authorized audit reads; sensitive-read review; full dependency audit; container vulnerability scanning; CI build and migration verification; staging, managed database/storage/identity and infrastructure-as-code if selected by the project owner; logs, metrics, alerts, error tracking, rollback, and horizontal-scaling guidance.
- **Testing/docs:** password reset expiry/single-use; profile and document access control; malformed/oversized files; document replacement/deletion; request/response/withdrawal; assignment/land-board/supervisor scope; notification state; token expiry/revocation; transaction rollback; rate-limit recovery; concurrent submissions and reference uniqueness; ML unavailable/invalid responses; browser end-to-end citizen/officer and full notification loop; live-update or polling behavior. Trace every requirement to evidence and disclose all blocked integrations.

Prioritise the smallest complete vertical slice: (1) request-information and citizen-response lifecycle, (2) Flutter upload plus application detail/timeline, (3) officer document access, assignment, and confirmation controls, (4) role/permission and session invalidation, (5) document safety/storage, (6) backup/observability and deployment, and (7) broad end-to-end/negative-path coverage. Repository evidence may change this order; record why.

## 5. Priority and implementation phases

Use this integrated order: first prove and stabilize the existing foundation; then complete the product-critical citizen/officer workflow; then add live updates; then ML assistance; finally harden for deployment. Repository evidence may justify a different order, but record the reason. Do not let optional ML or visual polish delay a broken core workflow.

### Phase 0 — Audit and stabilize
- Inspect repository and Git changes.
- Verify database configuration/schema/tables.
- Reproduce baseline tests and known failures.
- Fix critical startup/migration/schema issues before adding features.
- Produce a brief verified baseline report.

### Phase 1 — Complete the core citizen-to-officer-to-citizen lifecycle
Implement and verify this as one vertical slice before polishing optional features:
1. Citizen profile update and secure password-reset completion, including expiry and single-use checks.
2. Application drafts with save/resume, required-field validation, unique reference generation, and transactional persistence/history.
3. Flutter document upload with progress, retry, timeout/error handling, and server-confirmed success; application detail/timeline with document state.
4. Officer application detail with authorized private document preview/download, search, sort, land-board/status/priority filters, and server-backed pagination where needed.
5. `information_requested` status, a citizen-visible request message, citizen response, and additional-document response loop. Keep internal officer notes separate from citizen-visible messages.
6. Assignment/reassignment UI and endpoints, authorization scope, assignment history, and assignment notifications.
7. Approval/rejection confirmation dialogs and required reasons where policy requires them; implement withdrawal/cancellation only after confirming the permitted policy and transitions.
8. Persistent citizen and officer notifications, unread/read state, and a complete status/event/audit timeline.
9. Server-enforced roles, permissions, object-level access, and land-board scope. Add supervisor permissions only with an explicit role/permission model; do not grant implicit privileges.
10. Clear loading, empty, offline, timeout, session-expiry, unauthorized, and unavailable-service states with safe retry/re-authentication behavior.

### Phase 2 — Live updates and operational reliability
1. Implement Socket.IO/SSE or a documented bounded polling fallback; do not describe refetch-on-demand as live updates.
2. Update officer queues and citizen status/notifications after committed database changes.
3. Implement reconnect, resubscription, and refetch-after-reconnect behavior.
4. Scope events to authorized users/land boards and test unauthorized subscriptions.
5. Ensure event/notification publication occurs only after the database transaction commits; use an outbox or document a justified simpler reliability approach.
6. Test multiple authorized sessions, polling bounds, reconnects, duplicate events, and unavailable live-update services.

### Phase 3 — ML assistance
1. Python service, input/output schemas, and health/readiness
2. Deterministic completeness rules and exact missing-document reasons
3. Reproducible implementations of Logistic Regression, Decision Tree, and Random Forest for supported supervised targets
4. Fair, leakage-safe comparison of all three supervised models against the rule-based baseline, with metrics and a documented default-model recommendation
5. Duplicate/anomaly flags with clearly stated confidence/limitations
6. Transparent priority score based on documented, justified inputs (application age, completeness, workload, and urgency only where valid data/policy support them); keep it distinct from learned predictions.
7. Allow authorized manual priority/ML overrides only with a reason, actor, timestamp, prior value, and audit event.
8. Persist predictions/scores, explanations/reasons, model version, feature-schema version, and timestamps in a suitable durable model; do not rely on transient UI state.
9. Provide a common prediction interface for all candidate models, measure training/inference timing where practical, and report sample size/class balance and evaluation limits.
10. Synthetic-data generation and reproducible evaluation; state clearly when data is insufficient for meaningful training. Synthetic metrics are not evidence of real-world performance.
11. Officer dashboard displays the deterministic completeness result and selected model result without hardcoded example scores; ML must never autonomously approve, reject, or allocate land.
12. Document feature schema, target/label-generation logic, leakage review, known bias/drift limitations, and the need for real labelled data before production claims.

### Phase 4 — Production hardening and operations
1. Replace process-local-only rate limiting where multiple instances are supported; verify account lockout/progressive throttling and recovery.
2. Add refresh-token rotation/revocation or another documented server-side session invalidation design; logout must invalidate the session where the architecture promises it.
3. Validate uploaded file signatures (not only filename/MIME), define quarantine/fail-closed behavior, and integrate malware scanning before production use.
4. Add a production object-storage adapter (for example Azure Blob Storage) with private access, scoped downloads, checksum/version metadata, retention, controlled deletion, and document-access audit events.
5. Add version-tracked migrations with status tracking and a tested rollback/restore strategy; do not rewrite migration history already applied to valuable databases.
6. Provide database backup and restore scripts, backup encryption guidance, and a documented restore test.
7. Prepare staging/production configuration, HTTPS/reverse-proxy guidance, secret-store/managed identity guidance, and production migration approval steps. Azure infrastructure is a deployment target only if the project owner confirms it.
8. Add structured logs with request/correlation IDs and redaction, health/readiness checks, error tracking, metrics/alerts, and horizontal-scaling notes for shared storage/events.
9. Add CI jobs for lint, tests, builds, dependency audits across project packages, container build/vulnerability checks, and migration verification.
10. Document deployment rollback, safe seed policy, environment separation, and verified startup/deployment procedures.

Do not attempt a risky, all-at-once rewrite. Complete vertical slices, with tests and documented verification, in each phase. Do not claim production readiness while required production integrations or release gates remain blocked.

### Phase 5 — Close the verification and traceability gaps
1. Add automated tests for password-reset expiry/single-use, profile authorization, upload/download authorization, invalid file types, oversized uploads, replacement/deletion, information-request/response, withdrawal, assignment scope, supervisor permissions, notification read state, token expiry/revocation, rate-limit recovery, transaction rollback, and concurrent submissions/reference uniqueness.
2. Add ML tests for timeout/unavailable/invalid responses, schema validation, feature/target leakage safeguards, class balance/sample size reporting, and reproducible model comparison.
3. Add end-to-end tests for the citizen flow, officer flow, and citizen-to-officer-to-citizen loop, including denial paths and persisted history.
4. Verify actual builds, analyzers, migrations, startup, database persistence, and document access; record command output and blockers without claiming unrun checks passed.
5. Maintain a requirement-level evidence table with requirement, implementation file/API/table, permission rule, test/manual evidence, status (`verified`, `partial`, `missing`, `blocked`), known limitation, and policy owner/approval needed.
6. Explicitly disclose any unimplemented integration: malware scanner, production object storage, email/SMS reset provider, live-update mechanism, token revocation, supervisor model, backup/restore, observability, real labelled ML data, or production deployment verification.

## 6. Real-time dashboard acceptance criteria

The dashboard is not complete just because the page renders. Verify all of the following:
- Officer can log in and sees only authorized applications.
- Queue search/filter/sort works against actual API data.
- Selecting an application opens actual details, documents, and timeline.
- Authorized status/assignment actions update PostgreSQL and create audit/history records.
- Citizen receives a persisted notification after relevant changes.
- A second authorized browser/session sees new queue state without manual full-page reload when real-time is enabled, or within the documented polling interval otherwise.
- Unauthorized users cannot access the application through API calls, document URLs, or socket/SSE subscriptions.
- ML panel shows real computed results with reasons and model version, or clearly says the service is unavailable; no hardcoded example scores.
- Network/API/database failure states are clear and recover gracefully.
- Automated tests cover key success and denial paths.

## 7. Working method

Work in short, reviewable batches:

1. Announce the stage being implemented in one concise sentence.
2. Inspect relevant files and tests.
3. Make the smallest coherent change.
4. Add/update migrations and tests.
5. Run targeted tests, then broader checks when practical.
6. Review the diff for secrets, destructive changes, broken paths, and unauthorized access.
7. Report:
   - files changed
   - behavior implemented
   - commands actually run and their exact results
   - known gaps/blockers
   - the next best task

Do not repeatedly ask the user to choose between obvious technical steps. Make reasonable decisions based on repository evidence. If access to the repo, runtime, environment variables, credentials, or an external service is missing, state the exact blocker and ask for the minimum required input. Do not pretend to edit a local repository that you cannot access.

## 8. Definition of done

A feature is done only when:
- It is implemented in the actual project code, not only described.
- Its API and data model are consistent across Flutter, Express, PostgreSQL, React, and ML where relevant.
- Authentication, authorization, and input validation are enforced server-side.
- Loading, empty, error, offline, and unavailable-service states are handled where relevant.
- Tests cover both allowed and denied behavior.
- Relevant tests/build/analyzers were run and results are reported accurately.
- Documentation and `.env.example` are updated.
- No secrets, unsafe resets, fabricated ML outputs, or unverified claims are introduced.

## 9. Final deliverable format

When work is complete, provide:
1. **Summary:** what is actually working now
2. **Files changed:** grouped by component
3. **Verification:** commands run and exact results
4. **Security/data notes:** risks, migration/backup implications, unresolved policy choices
5. **Remaining work:** ordered by priority
6. **How to run:** verified local startup instructions

Begin now with Phase 0 (audit and stabilize), then continue into implementation. The goal is a working Ditsha system, not just a checklist.
