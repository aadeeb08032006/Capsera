# CAPSERA: Member 2 Work Log (Courses and Learning Resources)

## Task log

### Task 0: Repository inspection and work log setup (2026-11-11)
- Status: Done
- What was built:
  - Inspected repository folder structure, dependencies, database configuration, migrations, middleware, routes, and test setup.
  - Created `docs/MEMBER2_WORK_LOG.md` to track Member 2 tasks, issues, and team alignment decisions.
- Files created or changed: `docs/MEMBER2_WORK_LOG.md`
- How to test it: Read `docs/MEMBER2_WORK_LOG.md` and run `git status` to verify only the work log file was added.
- Tests added: None (inspection and setup task only; `server/node_modules` is not installed yet so `npm test` was not run).
- Issues, assumptions, or decisions:
  - Repository already uses PostgreSQL (`pg` / `pg.Pool`) instead of MySQL (`DR-002`); Member 2 implementation will follow the repository and use `pg` parameterized queries (`$1`, `$2`, ...).
  - `database/migrations/002_courses_and_learning.sql` already exists with tables `courses`, `lessons`, `learning_resources`, `enrollments`, and `lesson_progress`.
  - No validation library is installed yet (`DR-009` pending); no auth middleware exists yet (`DR-011` pending).
  - `docs/API_CONTRACT.md` differs from `server/src/utils/response.js` / `docs/PRD.md` on paginated response shape, base path (`/api` vs `/api/v1`), and several HTTP verbs (`PUT`/`PATCH`/`POST`) for courses, lessons, and progress.
- Needs from teammates:
  - Member 1: Confirm and implement auth middleware (`requireAuth` / `req.user` shape with `id`, `role`, `status`) and `JWT_SECRET` strategy (`DR-011`).
  - All members: Confirm validation library choice (`DR-009`), finalize `docs/API_CONTRACT.md` HTTP verbs/paths vs `docs/PRD.md` §11.4, and confirm file upload storage rules (`DR-012`) plus `sort_order` JSON field naming (`sortOrder` vs `position`).

### Task 1: Database migration for Member 2 tables (2026-11-11)
- Status: Done
- What was built:
  - Added sequential PostgreSQL migration `database/migrations/005_courses_and_learning_updates.sql` rather than editing already-committed `002_courses_and_learning.sql` (following `DR-019` so existing `schema_migrations` databases stay synchronized).
  - Updated `courses` with nullable `published_at` (`TIMESTAMPTZ`) and composite index `idx_courses_status_subject` on `(status, subject)`.
  - Updated `lessons` to rename `sort_order` to `position`, dropped redundant `idx_lessons_course_order`, and added `uq_lessons_course_position UNIQUE (course_id, position)`.
  - Updated `learning_resources` to rename `type` -> `resource_type` and `url` -> `external_url` (nullable), and added nullable `storage_key` plus `uploaded_by` FK to `users(id)` (`ON DELETE RESTRICT`) with index `idx_learning_resources_uploaded_by`.
  - Confirmed `enrollments` and `lesson_progress` in `002_courses_and_learning.sql` already satisfy all uniqueness and foreign-key constraints (including `DR-018` composite FKs).
  - Confirmed `users` already exists in `database/migrations/001_identity_and_skills.sql` and `database/seeds/` has no users seed yet, so no seed file was added.
- Files created or changed: `database/migrations/005_courses_and_learning_updates.sql`, `docs/MEMBER2_WORK_LOG.md`
- How to test it: Configure `server/.env`, install dependencies (`npm run install:all`), ensure PostgreSQL 18.6+ is running with `capsera_db` created (`createdb capsera_db`), then run `npm run db:migrate` and `npm run db:status`.
- Tests added: None (SQL migration task; not executed against PostgreSQL here because `psql`/`postgres`, `server/.env`, and `server/node_modules` are not present in this environment).
- Issues, assumptions, or decisions:
  - Followed `DR-002` (PostgreSQL 18.6+) instead of MySQL/InnoDB: used `CHECK` constraints instead of MySQL `ENUM(...)` and `TIMESTAMPTZ` for UTC timestamps to match `database/migrations/001..004` and `database/migrate.js`.
  - Used an additive migration (`005`) instead of modifying `002` so teammates whose DB already ran `001..004` do not hit skipped changes in `schema_migrations`.
  - Kept `courses.summary`, `lessons.updated_at`, and `lesson_progress.course_id` (composite FK per `DR-018`) intact from `002_courses_and_learning.sql`.
  - `uploaded_by INT NOT NULL` assumes `learning_resources` is empty when `005` runs (true in current repo since no seeds exist).
- Needs from teammates:
  - All members: Acknowledge schema alignment in `005` (`published_at`, `lessons.position`, `learning_resources.resource_type` / `storage_key` / `external_url` / `uploaded_by`) and update `docs/DATA_MODEL.md` if needed.
  - Member 1: Add the `users` seed (`database/seeds/001_admin_user.sql` or dev users seed) before Member 2 adds a demo course/lesson seed.

### Task 2: Rebase on updated main and build Courses API (2026-11-11)
- Status: Done
- What was built:
  - Cleaned up pre-pull local artifacts (`005_courses_and_learning_updates.sql`, `course.auth.js`, root `package-lock.json`, `server/package-lock.json` diff) after `git pull` brought in PRs #1–#3, and switched to `feature/courses`.
  - Implemented Courses API under `server/src/modules/courses/` (`course.validation.js`, `course.service.js`, `course.controller.js`, `course.routes.js`) and mounted `/api/v1/courses` in `server/src/app.js`.
  - Enforced server-side auth (`authenticate`, `requireRole`), ownership checks (owner trainer or `ADMIN`), `DRAFT`/`PUBLISHED`/`ARCHIVED` lifecycle transitions, publish field validation (`title`, `description`, `subject`, `level`), trainee `PUBLISHED`-only catalogue filtering, archive-over-delete on `DELETE`, Zod v4 validation, parameterized `pg` queries, string BIGINT IDs, ISO 8601 timestamps, and SQL error masking.
  - Added 25 Vitest + Supertest tests in `server/tests/courses.test.js` (mocking `server/src/config/db.js`).
- Files created or changed: `server/src/modules/courses/course.validation.js`, `server/src/modules/courses/course.service.js`, `server/src/modules/courses/course.controller.js`, `server/src/modules/courses/course.routes.js`, `server/src/app.js`, `server/tests/courses.test.js`, `docs/MEMBER2_WORK_LOG.md`
- How to test it: `npm run check:server` and `npm test --prefix server`
- Tests added: `server/tests/courses.test.js` (25 tests) — all 25 pass alongside all 7 tests in `server/tests/authMiddleware.test.js` (32/32 passed with mocked DB).
- Issues, assumptions, or decisions:
  - Aligned with pulled `003_create_courses_lessons_and_enrollments.sql` (`BIGINT` IDs serialized as strings per `SCHEMA-M1-01`, `users.full_name`, `courses.archived_at`, explicit `updated_at = CURRENT_TIMESTAMP` per `SCHEMA-SHARED-03`, and `AppError(statusCode, code, message)`).
  - Used `zod` (already added to `server/package.json` in PR #3; `OPEN-003` still open in `docs/DECISIONS.md` for team-wide validation sign-off).
  - Kept `POST /api/v1/courses/:courseId/archive` in addition to archive-preferring `DELETE /api/v1/courses/:courseId`.
  - Live PostgreSQL execution was not run here (`psql` and `.env` are not configured in this environment); DB queries were verified via mocked Vitest + Supertest tests.
- Needs from teammates:
  - All members: Review Member 2 `ADR-004` items (`SCHEMA-M2-01`..`04`, `OPEN-005`, `OPEN-007`) and confirm `zod` (`OPEN-003`) before Lessons/Resources/Enrollments implementation.

### Task 3: Add lessons and resources to the courses module (2026-11-11)
- Status: Done
- What was built:
  - Implemented Lessons API (`GET/POST /api/v1/courses/:courseId/lessons`, `PUT /api/v1/courses/:courseId/lessons/reorder`, `GET/PATCH/DELETE /api/v1/lessons/:lessonId`) with server-side course lookup + ownership enforcement, auto-assigned `lesson_order` mapped to JSON `position`, and transaction-safe reordering.
  - Added Multer (`^2.5.0`) upload middleware (`resource.upload.js`) storing files in gitignored local `server/uploads/` (not served statically) while persisting only metadata in PostgreSQL `learning_resources`, enforcing size limits (`413`), strict MIME/extension allowlist + executable/active-content blocking (`415`), filename sanitization, and cleanup on failed validation.
  - Implemented Learning Resources API (`POST/GET /api/v1/courses/:courseId/resources`, `GET /api/v1/courses/:courseId/resources/:resourceId/download`, `DELETE /api/v1/courses/:courseId/resources/:resourceId`), restricting read/download access to course owner, `ADMIN`, or `ACTIVE`/`COMPLETED` enrolled trainees (`403` otherwise) and omitting `storage_ref` from all JSON responses.
  - Extracted shared course DB/permission helpers into `course.helpers.js` and added 15 Vitest + Supertest tests in `server/tests/lessonsAndResources.test.js`.
- Files created or changed: `server/package.json`, `server/package-lock.json`, `server/src/app.js`, `server/src/modules/courses/course.helpers.js`, `server/src/modules/courses/course.validation.js`, `server/src/modules/courses/course.service.js`, `server/src/modules/courses/course.routes.js`, `server/src/modules/courses/lesson.validation.js`, `server/src/modules/courses/lesson.service.js`, `server/src/modules/courses/lesson.controller.js`, `server/src/modules/courses/lesson.routes.js`, `server/src/modules/courses/resource.upload.js`, `server/src/modules/courses/resource.validation.js`, `server/src/modules/courses/resource.service.js`, `server/src/modules/courses/resource.controller.js`, `server/src/modules/courses/resource.routes.js`, `server/tests/lessonsAndResources.test.js`, `docs/MEMBER2_WORK_LOG.md`
- How to test it: `npm run check:server` and `npm test --prefix server`
- Tests added: `server/tests/lessonsAndResources.test.js` (15 tests, covering auto-assigned positions, non-owner/unenrolled `403`, `413` oversized upload, `415` disallowed/executable upload, filename sanitization, cleanup on validation failure, link URLs, protected download streaming, and no `/uploads` static exposure) — 15/15 pass alongside existing suites (47/47 total passed with mocked `db.js`).
- Issues, assumptions, or decisions:
  - Installed `multer` (`^2.5.0`) in `server/` for `multipart/form-data` parsing; default limit is 25 MiB (`MAX_RESOURCE_FILE_SIZE_BYTES` env override) and default local storage folder is `server/uploads/` (`UPLOAD_DIR` env override), both covered by `.gitignore`.
  - Uses PostgreSQL tables `lessons` (`lesson_order` mapped to JSON `position`) and `learning_resources` (`storage_ref` kept internal; DTO exposes `downloadUrl` instead) per `003_create_courses_lessons_and_enrollments.sql` (`ADR-002`/`ADR-004`).
  - Live PostgreSQL execution was not run in this environment (verified via mocked `server/src/config/db.js` and real Multer/disk temp-dir file streaming in Supertest).
- Needs from teammates:
  - All members: Note added `multer` dependency in `server/package.json` and approve resource upload limits/types + DTO shape in `docs/API_CONTRACT.md` §6.3 when reviewing PR.

## Issues and decisions

1. **Database Engine — PostgreSQL (`pg`) instead of MySQL (`mysql2`):**
   - `docs/DECISIONS.md` (`DR-002`), `server/package.json`, `server/src/config/db.js`, `database/migrate.js`, and `database/migrations/*.sql` all use **PostgreSQL 18.6+** via `pg` (`Pool`) with `$1, $2` parameterized queries.
   - Following the project rule ("unless the repo already uses something else. Then follow the repo"), Member 2 code will use `getPool()` from `server/src/config/db.js` and PostgreSQL SQL.
2. **Validation Library (`DR-009` Pending):**
   - `server/package.json` currently has no schema validation dependency (`zod`, `joi`, `express-validator`, etc. are absent). `DR-009` marks the validation library as pending team consensus.
3. **Auth Middleware & Users Migration:**
   - `users`, `trainee_profiles`, and `trainer_profiles` tables already exist in `database/migrations/001_identity_and_skills.sql`.
   - Auth middleware (`requireAuth`, role/status guards) and `server/src/modules/auth/` do **not** exist yet (`server/src/middleware/` only has `errorHandler.js` and `notFound.js`).
4. **Existing Course Schema (`database/migrations/002_courses_and_learning.sql`):**
   - Member 2 tables (`courses`, `lessons`, `learning_resources`, `enrollments`, `lesson_progress`) are already defined in `002_courses_and_learning.sql`.
   - Note: `lessons` uses `sort_order` (not `position`), `learning_resources` has `url` (`VARCHAR(2000) NOT NULL`), `file_size`, `mime_type` (we must ensure raw storage URLs/paths are never leaked directly to unauthorized clients and align `DR-012`).
5. **Contract Discrepancies to Align Before Implementation:**
   - Paginated format: `server/src/utils/response.js` implements `{ success: true, data: { items, pagination } }` (matching PRD §11.2), while `docs/API_CONTRACT.md` §1.3 shows `pagination` at top level.
   - Endpoint methods: `docs/PRD.md` §11.4 specifies `PATCH /courses/:courseId`, `POST /courses/:courseId/publish`, `PATCH /enrollments/:enrollmentId/progress`, while `docs/API_CONTRACT.md` §4.2 lists `PUT /courses/:courseId`, `PATCH /courses/:courseId/publish`, `POST /enrollments/:enrollmentId/progress`.
   - `docs/API_CONTRACT.md` §3 lists base path `/api` whereas `server/src/app.js` mounts routes at `/api/v1`.
6. **Local Dependencies:**
   - `node_modules/` directories are not currently installed in root, `server/`, or `client/` (`npm run install:all` is needed before running tests or dev servers).
7. **Post-Pull Baseline (`origin/main` PRs #1–#3, updated 2026-11-11):**
   - Replaced pre-pull schema/core: `database/migrations/` now uses `001`–`005` (`003_create_courses_lessons_and_enrollments.sql` for Member 2), `server/src/middleware/authenticate.js` & `requireRole.js` are implemented (`req.user.id` is a string BIGINT), `zod` (`^4.6.7`), `vitest` (`^5.1.0`), and `supertest` (`^7.3.2`) are installed in `server/`, and `server/src/shared/` provides `AppError(statusCode, code, message)`, `asyncHandler`, `constants.js`, and `response.js`.
   - Note: `003_create_courses_lessons_and_enrollments.sql` names the lesson order column `lesson_order` and resource storage column `storage_ref` (documented under `ADR-004` `SCHEMA-M2-02` for team confirmation).

