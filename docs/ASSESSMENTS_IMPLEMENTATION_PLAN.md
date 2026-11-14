# CAPSERA — Member 3 Implementation Plan & Milestone Log

> **Owner:** Member 3 (Assessments, MCQ Questions, Attempts, Auto-Grading, Results & Course Feedback)  
> **Baseline:** Synced with `origin/main` (`caaa218`, PostgreSQL `capsera_db`, Express `/api/v1`)  
> **Schema Source of Truth:** [`database/migrations/004_create_assessments_attempts_and_feedback.sql`](../database/migrations/004_create_assessments_attempts_and_feedback.sql) & [`docs/DATA_MODEL.md`](./DATA_MODEL.md)

---

## 1. Alignment with Shared Repository Baseline

All Member 3 backend code follows the team conventions established on `main`:
- **Database:** PostgreSQL via `executeQuery` and `withTransaction` in `server/src/config/db.js` (`$1, $2, ...` parameterized queries).
- **Auth & Roles:** `authenticate` (`server/src/middleware/authenticate.js`) and `requireRole` (`server/src/middleware/requireRole.js`). `req.user.id` is a string representation of PostgreSQL `BIGINT`.
- **Errors & Responses:** `AppError(statusCode, code, message)` (`server/src/shared/AppError.js`), `asyncHandler`, and `sendSuccess` / `sendPaginated` (`server/src/shared/response.js`).
- **Validation:** `zod` schemas with `parseWithSchema` and `camelCase` JSON payloads (matching `server/src/modules/courses/course.validation.js`).
- **Testing:** `vitest` + `supertest` in `server/tests/`, mocking `server/src/config/db.js` for unit/API isolation plus live PostgreSQL smoke verification.

---

## 2. Milestone Tracker

| Milestone | Scope | Branch / Status |
|---|---|---|
| **Milestone 0** | Sync with `origin/main`, sign off `SCHEMA-M3-*` & `OPEN-005`, specify §6.4 in `API_CONTRACT.md` | **Done** (`feature/assessments`) |
| **Milestone 1** | Zod validation schemas + course ownership / active enrollment guard helpers + unit tests | **Done** (`feature/assessments`) |
| **Milestone 2** | Assessment CRUD & transactional publish (`>= 1` question check, lock when attempts exist) + tests | **Done** (`feature/assessments`) |
| **Milestone 3** | MCQ question bank CRUD + strict trainee answer-key sanitization (`correctOption` / `explanation` stripped) + tests | **Done** (`feature/assessments`) |
| **Milestone 4** | Attempt initiation (`POST /assessments/:assessmentId/attempts`), deadline/attempt-cap checks, stale expiry sweep + tests | Pending |
| **Milestone 5** | Atomic auto-grading (`POST /attempts/:attemptId/submit`), scorecards (`GET /attempts/me`, `GET /attempts/:attemptId`), course results (`GET /courses/:courseId/results`), and completion rule check + tests | Pending |
| **Milestone 6** | Course feedback upsert & privacy-safe summary (`POST`/`GET /courses/:courseId/feedback`) + tests | Pending |
| **Milestone 7** | Frontend Trainer UI (`client/src/features/assessments/`): assessment & MCQ builder + course results view | Pending |
| **Milestone 8** | Frontend Trainee UI: quiz player with timer, graded scorecard review, feedback widget + live PostgreSQL E2E check | Pending |

---

## 3. Core Invariants Enforced Across Milestones

1. **Answer-Key Isolation (PRD §6.5, §8.1):** Trainees never receive `correctOption` or `explanation` in assessment reads, question listings, or `IN_PROGRESS` attempts.
2. **Server-Side Scoring & Row Locking (PRD §6.5, §8.3):** `POST /api/v1/attempts/:attemptId/submit` ignores any client score fields, locks the attempt row (`SELECT ... FOR UPDATE`), grades strictly from `questions`, and persists `attempt_answers` + `assessment_attempts` atomically inside `withTransaction`.
3. **Attempt Limits & Stale Expiry (`004` partial unique index):** Timed-out `IN_PROGRESS` attempts are transitioned to `EXPIRED` inside a transaction before creating a permitted retry (`attempt_number <= max_attempts`).
4. **Attempt-Locking (`SCHEMA-M3-01`):** Once an assessment has recorded attempts, structural scoring changes (`passPercentage`, `maxAttempts`, `durationMinutes`, `isRequired`, and question edits/deletes affecting `correctOption` or `points`) are rejected with `409 ASSESSMENT_LOCKED`.
5. **Course Completion Integration (PRD §6.6):** A trainee's enrollment becomes `COMPLETED` only when all course lessons are complete (`totalLessons > 0` and `completedLessons === totalLessons`) **and** all `PUBLISHED` assessments with `is_required = TRUE` have a `GRADED` passing attempt (`is_passed = TRUE`).
