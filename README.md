# CAPSERA — Digital Capacity Building and Learning Management Portal

CAPSERA is a four-member academic / Smart India Hackathon (`SIH26075`) web portal for organizational capacity building, competency mapping, training courses, MCQ assessments, progress tracking, and completion certificates.

> **Reference Specifications:** [docs/PRD.md](./docs/PRD.md) (PRD v1.0), [docs/DECISIONS.md](./docs/DECISIONS.md) (`ADR-002` PostgreSQL architecture), [docs/API_CONTRACT.md](./docs/API_CONTRACT.md), and [docs/DATA_MODEL.md](./docs/DATA_MODEL.md).

---

## 1. Architecture & Technical Stack

- **Frontend:** React 18 + Vite 5 + React Router v6 (`client/`) with role-scoped portal shells (`AdminLayout`, `TrainerLayout`, `TraineeLayout`) and shared inline SVG icons (`UiIcon.jsx`).
- **Backend:** Node.js + Express (`server/src/app.js`) exposing a versioned REST API at `/api/v1`.
  - **Security & Middleware:** `helmet`, explicit-origin `cors`, JSON body limits (`1mb` default, `10kb` on `/api/v1/auth/*`), `express-rate-limit` on `/api/v1/auth/*`, `bcryptjs` password hashing, JWT authentication (`HS256`), and per-request PostgreSQL account-status validation (`authenticate.js`).
  - **File Storage:** Local disk storage via `multer` under `server/uploads/` (gitignored; configurable via `UPLOAD_DIR` and `MAX_RESOURCE_FILE_SIZE_BYTES`) with path-traversal confinement and authenticated download entitlement checks.
- **Database:** PostgreSQL 15+ (`capsera_db`) accessed via `pg` connection pool with parameterized `$1, $2, ...` queries and SQL transactions (`withTransaction`) for grading, progress updates, competency replacement, and atomic certificate issuance.

---

## 2. Repository Structure

```text
Capsera/
├── client/                         # React + Vite frontend
│   ├── .env.example
│   └── src/
│       ├── app/                    # Root router and RolePortalShell (App.jsx)
│       ├── components/             # Shared Navbar and UiIcon SVG system
│       ├── features/
│       │   ├── admin/              # AdminLayout, AdminDashboardPage, AdminUsersPage
│       │   ├── announcements/      # Public feed & AdminAnnouncementsPage
│       │   ├── assessments/        # QuizPlayer, ScorecardModal, CourseFeedbackForm, Builder & Results + helpers/tests
│       │   ├── auth/               # LoginPage, SignupPage, ChangePasswordPage, AuthContext, ProtectedRoute
│       │   ├── certificates/       # MyCertificatesPage, AdminCertificatesPage, VerifyCertificatePage
│       │   ├── competency/         # AdminSkillsPage, TraineeSkillsPage, TrainerSkillsPage, SkillMappingEditor, TrainerRecommendationsPage
│       │   ├── courses/            # CourseCataloguePage, CourseDetailPage, MyLearningPage, LessonViewerPage, TrainerCoursesPage, CourseFormPage, ManageLessonsPage, ResourceUploadModal
│       │   ├── profiles/           # Role-specific profile editor
│       │   ├── trainee/            # TraineeLayout & TraineeDashboardPage
│       │   └── trainer/            # TrainerLayout & TrainerDashboardPage
│       ├── services/               # Shared API client (apiClient.js)
│       └── styles/                 # Global styles (index.css)
├── server/                         # Node.js + Express REST API
│   ├── .env.example
│   ├── scripts/                    # seed-admin.js and seed-demo.js
│   ├── src/
│   │   ├── config/                 # env.js & PostgreSQL pool (db.js)
│   │   ├── middleware/             # authenticate, requireRole, notFoundHandler, errorHandler
│   │   ├── modules/                # admin, announcements, assessments, auth, certificates, competency, courses, enrollments, profiles, users
│   │   ├── shared/                 # AppError, asyncHandler, constants, response envelopes
│   │   ├── app.js                  # Express app configuration & /api/v1 router
│   │   └── index.js                # HTTP server entry point
│   └── tests/                      # Vitest unit, API, and PostgreSQL integration suites
├── database/
│   ├── migrations/                 # Sequential PostgreSQL DDL migrations (001 through 006)
│   └── seeds/                      # Seed documentation
├── docs/                           # PRD, ADRs, API Contract, and Data Model
├── .env.example
└── package.json                    # Root convenience scripts
```

---

## 3. Four-Member Module Ownership (PRD Section 13)

| Member | Owned Scope | Primary Entities |
|---|---|---|
| **Member 1** | Identity, profiles, and user governance (signup, login, auth middleware, admin approval/role/reset management) | `User`, `TraineeProfile`, `TrainerProfile` |
| **Member 2** | Courses and learning resources (course CRUD, publish/archive, lessons, resource library, enrollment, lesson progress) | `Course`, `Lesson`, `LearningResource`, `Enrollment`, `LessonProgress` |
| **Member 3** | Assessments, results, progress, and feedback (MCQ authoring, attempt lifecycle, server-side scoring, result analytics, feedback) | `Assessment`, `Question`, `AssessmentAttempt`, `AttemptAnswer`, `Feedback` |
| **Member 4** | Competency, certificates, announcements, and admin dashboard (skill catalogue/mapping, deterministic trainer matching, certificates, announcements, dashboard metrics) | `Skill`, `TraineeSkill`, `TrainerSkill`, `Certificate`, `Announcement` |

---

## 4. Environment Variables

### Server (`server/.env`)

Copy `server/.env.example` to `server/.env`. `server/src/config/env.js` loads `server/.env` first and falls back to root `.env`:

| Variable | Required / Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `seed:demo` refuses to run when set to `production` |
| `PORT` | `5000` | Express API port (`client/vite.config.js` proxies `/api/v1` to `5001` unless `VITE_DEV_PROXY_TARGET` is set) |
| `API_PREFIX` | `/api/v1` | Mounted REST prefix |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Explicit CORS origin required; wildcard `*` is rejected at startup |
| `DATABASE_URL` | Optional | Full PostgreSQL URI; overrides individual `DB_*` variables when set |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `127.0.0.1`, `5432`, `capsera_db`, `postgres`, `""` | Individual PostgreSQL connection settings |
| `DB_CONNECTION_LIMIT`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS` | `10`, `30000`, `5000` | `pg` pool sizing and timeouts |
| `JWT_SECRET` | **Required (>= 32 chars)** | Startup fails if missing or shorter than 32 characters |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime |
| `BCRYPT_COST` | `12` | Password hashing cost factor |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME` | Required for `seed:admin` | Initial active Admin account values |
| `DEMO_PASSWORD` | Required for `seed:demo` | Must satisfy signup password policy (min 8 chars, letter + number) |
| `UPLOAD_DIR`, `MAX_RESOURCE_FILE_SIZE_BYTES` | Optional | Defaults to `server/uploads/` and built-in Multer limit |

### Client (`client/.env`)

Copy `client/.env.example` to `client/.env`:

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | API base URL used by `client/src/services/apiClient.js` |
| `VITE_DEV_PROXY_TARGET` | `http://127.0.0.1:5001` | Used by `client/vite.config.js`; set to `http://127.0.0.1:5000` when running `server` on `PORT=5000` |

---

## 5. Local Installation & Database Setup

### Prerequisites
- **Node.js** `>= 18.x`
- **PostgreSQL** `>= 15.x` (`psql` and `createdb` in `PATH`)

### 1. Create database and apply migrations in order
```bash
createdb -U postgres capsera_db

psql -h 127.0.0.1 -p 5432 -U postgres -d capsera_db -v ON_ERROR_STOP=1 \
  -f database/migrations/001_create_users_and_profiles.sql \
  -f database/migrations/002_create_skills_and_competency.sql \
  -f database/migrations/003_create_courses_lessons_and_enrollments.sql \
  -f database/migrations/004_create_assessments_attempts_and_feedback.sql \
  -f database/migrations/005_create_certificates_and_announcements.sql \
  -f database/migrations/006_create_audit_logs.sql
```

### 2. Install dependencies & configure environment
```bash
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
```
In `client/.env`, if your backend uses `PORT=5000`, also add `VITE_DEV_PROXY_TARGET=http://127.0.0.1:5000` (or set `VITE_API_BASE_URL=http://127.0.0.1:5000/api/v1`).

### 3. Seed Admin & optional demo accounts
```bash
# Creates the initial ACTIVE ADMIN account from ADMIN_* env vars
npm run seed:admin --prefix server

# Optional (non-production only): seeds 9 synthetic users (@example.com) across ACTIVE/PENDING/REJECTED/SUSPENDED states
npm run seed:demo --prefix server
```

### 4. Start backend and frontend
In separate terminals from the repository root:
```bash
npm run dev:server
npm run dev:client
```
Verify API & DB health:
- `GET http://localhost:5000/api/v1/health`
- `GET http://localhost:5000/api/v1/health?db=true`

---

## 6. Role-Specific Workflows

- **Public Visitor:** Browse `/login`, `/signup` (creates `PENDING` `TRAINEE` or `TRAINER` accounts; public `ADMIN` signup is blocked), and verify issued certificates at `/certificates/verify` or `/certificates/verify/:certificateCode`.
- **Admin:** Lands on `/admin/dashboard` (database-backed user, course, enrollment, assessment, and certificate counts), approves/rejects/suspends users and issues temporary password resets at `/admin/users`, manages canonical skills at `/admin/skills`, publishes/archives announcements at `/admin/announcements`, inspects/revokes certificates at `/admin/certificates`, and oversees courses/assessments.
- **Trainer:** Lands on `/` (`TrainerDashboardPage`), authors/publishes courses at `/trainer/courses` and `/trainer/courses/new`, orders lessons and uploads study resources at `/trainer/courses/:courseId/lessons`, authors/publishes MCQs at `/courses/:courseId/assessments/manage` (or selects an owned course from `/assessments/manage`), reviews student attempts at `/assessments/results`, and maps expertise at `/trainer/skills`.
- **Trainee:** Lands on `/` (`TraineeDashboardPage`), browses published courses at `/courses`, enrolls and tracks progress at `/my-learning`, completes lessons at `/courses/:courseId/lessons/:lessonId`, takes timed or untimed assessments at `/courses/:courseId/assessments/:assessmentId/player`, submits course reviews at `/courses/:courseId/feedback`, maps skills at `/skills`, searches explainable trainer matches at `/trainers/recommendations`, and views earned certificates at `/certificates`.

---

## 7. API Overview

All REST endpoints are mounted under `/api/v1` (see [docs/API_CONTRACT.md](./docs/API_CONTRACT.md) for full request/response schemas):
- `/auth` — signup, login, current user, change-password
- `/admin/users` & `/admin/dashboard` — governance actions, password reset, live aggregate metrics
- `/profiles` & `/profiles/me/skills` & `/profiles/me/trainer-skills` — role-specific profiles and competency mappings
- `/courses`, `/lessons`, `/enrollments` — course lifecycle, ordered lessons, protected resources, enrollments, progress
- `/courses/:courseId/assessments`, `/assessments`, `/attempts`, `/courses/:courseId/results`, `/courses/:courseId/feedback` — assessment engine, server-side grading, analytics, reviews
- `/skills`, `/trainers/recommendations` — canonical skill catalogue and deterministic trainer matching
- `/announcements`, `/certificates` — homepage announcements, certificate issuance, and public verification

Responses follow `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`.

---

## 8. Verification & Test Commands

```bash
# Client production build
npm run build:client

# Client unit tests (assessment timer/course helpers + competency clear guard)
node --test client/src/features/assessments/assessmentHelpers.test.js client/src/features/competency/skillMappingEditorLogic.test.js

# Backend syntax & unit/API tests
npm run check:server
npm test --prefix server

# Backend real PostgreSQL integration suites (dedicated test DB: capsera_cp03_test)
RUN_PG_INTEGRATION=true DB_NAME=capsera_cp03_test npx --prefix server vitest run --no-file-parallelism \
  tests/certificates.integration.test.js \
  tests/learningFlow.integration.test.js \
  tests/dashboard.integration.test.js \
  tests/member4.qa.integration.test.js \
  tests/announcements.integration.test.js \
  tests/recommendations.integration.test.js \
  tests/skills.integration.test.js
```
