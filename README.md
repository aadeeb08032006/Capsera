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

### 1. Install PostgreSQL and create the database
Install PostgreSQL 15+ using your platform's package manager or installer, ensure `psql` and `createdb` are available, and start the service. Then create the local database. The default local role is `postgres`; use `DB_USER` and `DB_PASSWORD` in `server/.env` to match your local PostgreSQL authentication setup.
```bash
createdb -U postgres capsera_db
```

### 2. Apply migrations in order
Apply these to an empty local database after the team has approved the schema migrations. If using `DATABASE_URL`, pass that connection string to `psql` instead of the host/user flags.
```bash
psql -h 127.0.0.1 -p 5432 -U postgres -d capsera_db -v ON_ERROR_STOP=1 \
	-f database/migrations/001_create_users_and_profiles.sql \
	-f database/migrations/002_create_skills_and_competency.sql \
	-f database/migrations/003_create_courses_lessons_and_enrollments.sql \
	-f database/migrations/004_create_assessments_attempts_and_feedback.sql \
	-f database/migrations/005_create_certificates_and_announcements.sql \
	-f database/migrations/006_create_audit_logs.sql
```

### 3. Configure environment variables
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```
Set PostgreSQL credentials in `server/.env`. `DATABASE_URL`, when provided, takes precedence over `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. Set `JWT_SECRET` to a random secret of at least 32 characters and configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_FULL_NAME` for the initial admin.
Set `DEMO_PASSWORD` to a development-only password that meets the signup policy before running the demo seed.

### 4. Install dependencies
```bash
npm run install:all
```

### 5. Seed the admin account
```bash
cd server && npm run seed:admin
```

### 6. Seed synthetic demo accounts (optional)
```bash
cd server && npm run seed:demo
```
This command refuses to run when `NODE_ENV=production` and seeds nine synthetic users with `@example.com` addresses.

### 7. Run the server and client
In separate terminals from the repository root:
```bash
npm run dev:server
npm run dev:client
```

### 8. Run checks
```bash
cd server
npm test
cd ../client
npm run build
```
Health endpoints: `GET http://localhost:5000/api/v1/health` and `GET http://localhost:5000/api/v1/health?db=true`.

---

## 5. Courses Module (Member 2)

The Courses & Learning Resources module handles course authoring, lesson structuring, learning resource management with protected file uploads/downloads, trainee enrollment, and dynamic progress tracking.

### 5.1 Run Database Migrations
The module requires tables from `001_create_users_and_profiles.sql` (for trainer/trainee foreign keys) and `003_create_courses_lessons_and_enrollments.sql` (`courses`, `lessons`, `learning_resources`, `enrollments`, `lesson_progress`):

```bash
# Apply migrations sequentially using psql
psql -h 127.0.0.1 -p 5432 -U postgres -d capsera_db -v ON_ERROR_STOP=1 \
  -f database/migrations/001_create_users_and_profiles.sql \
  -f database/migrations/003_create_courses_lessons_and_enrollments.sql
```

### 5.2 Seeding & Environment Setup
1. **Admin & User Accounts:** Run the admin seed script to ensure at least one `ACTIVE` `ADMIN` account exists:
   ```bash
   npm run seed:admin --prefix server
   ```
2. **File Upload Directory:** Study materials uploaded via `POST /api/v1/courses/:courseId/resources` are stored locally under `server/uploads/` (gitignored, not served statically). The folder is automatically created by the Multer upload middleware if absent.

### 5.3 Run Module Tests
Member 2 unit, validation, and integration tests run with Vitest:

```bash
# Run all server tests (including courses, lessons, and enrollments)
npm test --prefix server

# Run courses lifecycle & visibility test suite
npm test --prefix server -- tests/courses.test.js

# Run lessons & learning resources upload/download test suite
npm test --prefix server -- tests/lessonsAndResources.test.js

# Run enrollments & progress tracking test suite
npm test --prefix server -- tests/enrollments.test.js

# Verify frontend build & components
npm run build:client
```

---

## 6. Documentation & Governance

Before implementing any module endpoints or SQL migrations, review and update:
1. [docs/DECISIONS.md](./docs/DECISIONS.md) — Review `ADR-002` (PostgreSQL migration + proposed PRD v1.0 amendments) and resolve applicable open team choices.
2. [docs/API_CONTRACT.md](./docs/API_CONTRACT.md) — Specify request/response payloads for your owned endpoints.
3. [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) — Finalize table columns and foreign key names before creating SQL files in `database/migrations/`.

## 6. Using authentication in your module

Protect a trainer-only endpoint by applying `authenticate` before `requireRole`:
```js
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();
router.post('/', authenticate, requireRole('TRAINER'), createCourseHandler);
```

After `authenticate`, `req.user` contains `id` (string), `fullName`, `email`, `role`, `status`, and `createdAt`. Do not trust a role or owner ID from request data; use `req.user` and enforce ownership in the service. Errors use `{ success: false, error: { code, message } }`. Common codes are `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `ACCOUNT_PENDING`, `ACCOUNT_REJECTED`, or `ACCOUNT_SUSPENDED`, `400 VALIDATION_ERROR`, resource-specific `404 *_NOT_FOUND`, conflict-specific `409` codes, and `429 RATE_LIMITED`.
