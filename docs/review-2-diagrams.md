# Review 2 System Diagrams

These Mermaid diagrams are the source-controlled draft artifacts for Review 2. They can be rendered by GitHub, VS Code extensions, or exported to Draw.io/SVG for presentation.

## Entity relationship diagram

```mermaid
erDiagram
  CITIZEN ||--o{ APPLICATION : submits
  LAND_BOARD ||--o{ APPLICATION : receives
  LAND_BOARD ||--o{ OFFICER : employs
  OFFICER ||--o{ APPLICATION : assigned
  APPLICATION ||--o{ APPLICATION_EVENT : records
  OFFICER ||--o{ APPLICATION_EVENT : creates
```

## Citizen application submission

```mermaid
sequenceDiagram
  actor Citizen
  participant App as Flutter App
  participant API as Express API
  participant DB as PostgreSQL
  Citizen->>App: Enter application details
  App->>API: POST /api/applications with JWT
  API->>API: Verify citizen role
  API->>DB: Insert application
  DB-->>API: New application ID and reference
  API-->>App: submitted response
  App-->>Citizen: Show reference number
```

## Officer review

```mermaid
sequenceDiagram
  actor Officer
  participant Dashboard as React Dashboard
  participant API as Express API
  participant DB as PostgreSQL
  Officer->>Dashboard: Sign in
  Dashboard->>API: POST /api/auth/officer/login
  API->>DB: Validate officer hash
  API-->>Dashboard: JWT and officer identity
  Dashboard->>API: GET /api/officer/applications
  API->>DB: Query assigned applications and citizen names
  DB-->>API: Queue records
  API-->>Dashboard: Paginated queue
```

## Component view

```mermaid
flowchart LR
  Flutter[Flutter Citizen App] --> API[Node.js Express API]
  React[React Officer Dashboard] --> API
  API --> DB[(PostgreSQL 15)]
  Generator[Python Faker Generator] --> DB
  API --> Tests[Jest and Supertest]
```

## Review 2 follow-ups

- Export these diagrams to Draw.io or SVG if a native diagram file is required by the review rubric.
- Add the ML pipeline participant when the model service contract is finalized.