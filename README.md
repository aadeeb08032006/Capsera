# CAPSERA — Digital Capacity Building and Learning Management Portal

CAPSERA is a four-member Advanced Programming / Smart India Hackathon (SIH26075) web portal for organizational capacity building, competency mapping, training courses, MCQ assessments, progress tracking, and completion certificates.

> **Single Source of Truth:** [docs/PRD.md](./docs/PRD.md) (CAPSERA PRD v1.0) and [docs/DECISIONS.md](./docs/DECISIONS.md) (`ADR-002`: faculty-mandated migration from MySQL to PostgreSQL, pending formal team approval).

---

## 1. Technical Stack

- **Frontend:** React + Vite (JavaScript), React Router (`client/`)
- **Backend:** Node.js + Express (JavaScript) (`server/`)
- **Database:** PostgreSQL (`capsera_db`) *(Required by faculty; see [docs/DECISIONS.md](./docs/DECISIONS.md) — `ADR-002`)*
- **Database Access Layer:** `pg` (`node-postgres` connection pool) with `$1, $2, ...` parameterized queries *(Proposed in [docs/DECISIONS.md](./docs/DECISIONS.md) — `ADR-002`, pending team approval)*
- **API Base Path:** `/api/v1`

---

## 2. Repository Structure

```text
capsera/
├── client/                 # React + Vite frontend
│   └── src/
│       ├── app/            # Root App router shell
│       ├── components/     # Shared UI components
│       ├── features/       # Feature modules (auth, profiles, courses, assessments, competency, admin)
│       ├── layouts/        # Role-aware layout shells
│       ├── services/       # Shared API client (/api/v1)
│       ├── hooks/          # Custom React hooks
│       └── styles/         # Global CSS
├── server/                 # Node.js + Express REST API
│   └── src/
│       ├── config/         # Environment & PostgreSQL pool configuration (db.js, env.js)
│       ├── middleware/     # Global error and 404 handlers
│       ├── modules/        # Domain modules (auth, users, profiles, courses, enrollments, assessments, competency, feedback, certificates, announcements, admin)
│       ├── shared/         # Canonical constants and response envelope helpers
│       ├── app.js          # Express app definition
│       └── index.js        # HTTP server entry point
├── database/
│   ├── migrations/         # Versioned PostgreSQL migrations
│   └── seeds/              # Synthetic demo & initial admin seed scripts
├── docs/
│   ├── PRD.md              # Product Requirements Document v1.0 (finalized baseline)
│   ├── DECISIONS.md        # Architecture Decision Records (including ADR-002 PostgreSQL & PRD amendment table)
│   ├── API_CONTRACT.md     # Canonical /api/v1 conventions, endpoint map, and unresolved payloads
│   └── DATA_MODEL.md       # Canonical entities, table registry, relationships, and unresolved schemas
├── .env.example            # Root environment variable template
├── .gitignore
└── package.json            # Root convenience scripts
```

---

## 3. Four-Member Module Ownership (PRD Section 13)

| Member | Owned Scope | Canonical Entities |
|---|---|---|
| **Member 1** | Identity, profiles, and user governance (signup, login, auth middleware, admin approval/role management) | `User`, `TraineeProfile`, `TrainerProfile` |
| **Member 2** | Courses and learning resources (course CRUD, publish/archive, lessons, resource library, enrollment, lesson progress) | `Course`, `Lesson`, `LearningResource`, `Enrollment`, `LessonProgress` |
| **Member 3** | Assessments, results, progress, and feedback (MCQ creation, attempt lifecycle, server-side scoring, result review, feedback) | `Assessment`, `Question`, `AssessmentAttempt`, `AttemptAnswer`, `Feedback` |
| **Member 4** | Competency, certificates, announcements, and admin dashboard (skill catalogue/mapping, explainable trainer matching, certificates, announcements, dashboard metrics) | `Skill`, `TraineeSkill`, `TrainerSkill`, `Certificate`, `Announcement` |

---

## 4. Getting Started (Local Development)

### Prerequisites
- **Node.js** `>= 18.x`
- **PostgreSQL** `>= 15.x`

### 1. Configure Environment Variables
Copy `.env.example` to `.env` (or into `server/.env` and `client/.env`) and update your local PostgreSQL credentials (`DB_PORT=5432`, `DB_USER=postgres`, `DB_NAME=capsera_db`):
```bash
cp .env.example .env
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### 2. Create Local PostgreSQL Database
Ensure your local PostgreSQL service is running, then create the canonical `capsera_db` database:
```bash
createdb -U postgres capsera_db
```
Or via `psql`:
```sql
CREATE DATABASE capsera_db ENCODING 'UTF8';
```

### 3. Install Dependencies
```bash
npm run install:all
```

### 4. Run Backend and Frontend
In two terminals:
```bash
# Terminal 1: Start Express API on http://localhost:5000/api/v1
npm run dev:server

# Terminal 2: Start Vite React client on http://localhost:5173
npm run dev:client
```

### 5. Verify Health Endpoint
- API health check: `GET http://localhost:5000/api/v1/health`
- API + PostgreSQL connectivity check: `GET http://localhost:5000/api/v1/health?db=true`

---

## 5. Documentation & Governance

Before implementing any module endpoints or SQL migrations, review and update:
1. [docs/DECISIONS.md](./docs/DECISIONS.md) — Approve `ADR-002` (PostgreSQL migration + proposed PRD v1.0 amendments) and resolve open team choices (`OPEN-001` through `OPEN-006`).
2. [docs/API_CONTRACT.md](./docs/API_CONTRACT.md) — Specify request/response payloads for your owned endpoints.
3. [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) — Finalize table columns and foreign key names before creating SQL files in `database/migrations/`.
