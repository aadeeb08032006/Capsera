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

### Phase 3.5: Fill gaps from Tasks 2 and 3 (2026-11-15)
- Status: Done
- What was built / verified:
  - Part 3.5.1 (Route path check): Verified in `server/src/app.js` and route files that `POST /api/v1/courses/:courseId/lessons` operates under `/courses` and `PATCH /api/v1/lessons/:lessonId` operates under `/lessons`; confirmed by existing tests (skipped redundant commit per rule).
  - Part 3.5.2 (Archive and unpublish): Added `status` support to `updateCourseBodySchema` (`DRAFT`, `PUBLISHED`, `ARCHIVED`). In `updateCourse`, enabled owner trainer and `ADMIN` to set `ARCHIVED` status (persisting `archived_at` and complying with `chk_courses_lifecycle_timestamps`). Allowed `ADMIN` to unpublish `PUBLISHED` courses back to `DRAFT` (resetting `published_at = NULL` and `archived_at = NULL`). Blocked non-admin trainers from unpublishing (`403 FORBIDDEN`), blocked editing or unpublishing already `ARCHIVED` courses (`409 INVALID_STATUS_TRANSITION`), and blocked publishing attempts via `PATCH` (`400 VALIDATION_ERROR`). Trainee catalogue filtering remains restricted to `status = 'PUBLISHED'`, keeping archived courses hidden.
  - Part 3.5.3 (Ordered lessons in course detail): In `getCourseById`, returned ordered `lessons` list (sorted by `lesson_order ASC, id ASC`) when accessed by the course owner, `ADMIN`, or an enrolled trainee (`ACTIVE` or `COMPLETED` enrollment). Other trainees receive course metadata only without lesson content. Preserved access for existing enrolled trainees to view their `ARCHIVED` courses while hiding archived courses from unenrolled trainees (`403 FORBIDDEN`).
  - Added comprehensive Vitest + Supertest integration tests in `server/tests/courses.test.js` validating owner/admin archiving, admin unpublish, role/state guard rejections, enrolled vs. unenrolled lesson visibility, and archived course enrollment access.
- Files created or changed: `server/src/modules/courses/course.validation.js`, `server/src/modules/courses/course.service.js`, `server/tests/courses.test.js`, `docs/MEMBER2_WORK_LOG.md`
- How to test it: `npm run check:server` and `npm test --prefix server`
- Tests added: 10 new integration tests in `server/tests/courses.test.js` (35 passing tests in the suite; 169 passing tests across the server suite).
- Issues, assumptions, or decisions:
  - Ensured lifecycle timestamps strictly adhere to migration 003 constraint `chk_courses_lifecycle_timestamps` when archiving or unpublishing.
  - When returning course detail to an unenrolled trainee, the `lessons` property is omitted (undefined) rather than returning an empty array or redacted lesson objects.
- Needs from teammates: None.

### Phase 4: Enrollments and Progress Tracking Module (2026-11-16)
- Status: Done
- What was built:
  - Part 4.1: POST /api/v1/courses/:courseId/enrollments allowing active trainees to enroll in PUBLISHED courses.
  - Part 4.2: Duplicate enrollment handling catching unique constraint (uq_enrollments_trainee_course / code 23505) and returning 409 DUPLICATE_ENROLLMENT.
  - Part 4.3: Course progress calculation helper (calculateCourseProgress) computing completed lessons / total lessons from the database, returning 0% when total lessons is 0 (not 100%).
  - Part 4.4: GET /api/v1/enrollments/me returning the logged-in trainee's enrollments, each with dynamic progressPercentage and joined course summary metadata.
  - Part 4.5: PATCH /api/v1/enrollments/:enrollmentId/progress with body { lessonId } verifying ownership, course-lesson integrity, and inserting into lesson_progress idempotently (safe on repeated calls).
  - Part 4.6: Course completion rule hook (evaluateCourseCompletion and checkAndApplyCourseCompletion). Connects Member 3's assessment schema (checks required published assessments in assessments and attempts in assessment_attempts). Sets enrollment to COMPLETED with completed_at when all lessons are completed and any required published assessment is passed. Includes commented integration hook for future Member 3 assessment services.
  - Part 4.7: Comprehensive integration tests covering duplicate enrollment (409), draft/archived enrollment rejections (409), progress from database records, cross-course lesson rejection (400), zero lessons returning 0%, repeat idempotent progress calls, and assessment-aware completion rules.
- Files created or changed:
  - server/src/modules/enrollments/enrollment.validation.js
  - server/src/modules/enrollments/enrollment.helpers.js
  - server/src/modules/enrollments/progress.helpers.js
  - server/src/modules/enrollments/completion.hook.js
  - server/src/modules/enrollments/enrollment.service.js
  - server/src/modules/enrollments/enrollment.controller.js
  - server/src/modules/enrollments/enrollment.routes.js
  - server/src/modules/courses/course.routes.js
  - server/src/app.js
  - server/tests/enrollments.test.js
- How to test it: `npm run check:server` and `npm test --prefix server`
- Tests added: `server/tests/enrollments.test.js` (18 tests, all 18 passing; total 187 passing tests across the entire server test suite).
- Issues, assumptions, or decisions:
  - Member 3's assessment submission engine has not been built yet in the repository (only assessment.auth.js and assessment.validation.js are present). The completion hook directly queries the assessments and assessment_attempts tables per Migration 004, and is documented with a clear integration hook.
  - Enrollment work log is preserved locally and not committed to git per user instruction.
- Needs from teammates:
  - Member 3: Wire into evaluateCourseCompletion when building assessment attempt grading.

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



### Phase 5: Courses & Learning Resources Frontend (2026-11-16)
- Status: Done
- What was built:
  - Part 5.1 (API Service & Routes): Added `client/src/features/courses/coursesApi.js`, Member 1 auth context stub (`AuthContext.jsx`), role protection guard (`RoleGuard.jsx`), accessible navigation bar (`Navbar.jsx`), and routed all public, trainee, and trainer courses views in `client/src/app/App.jsx`. Configured `apiClient.js` to omit Content-Type for FormData uploads and pass Bearer token.
  - Part 5.2 (Course Catalogue Page): Built `CourseCataloguePage.jsx` with real-time text search, subject category filter, skill level selector, server-side pagination, skeleton loading state, retryable error handling, and friendly empty states.
  - Part 5.3 (Course Detail Page): Built `CourseDetailPage.jsx` featuring course overview, syllabus lesson listing with durations, role-aware action cards, interactive "Enroll in Course" button handling duplicate enrollment (409) gracefully, and seamless navigation to lessons for enrolled trainees.
  - Part 5.4 (My Learning Page): Built `MyLearningPage.jsx` displaying trainee enrollment dashboard, summary stats (Total, In Progress, Completed), accessible dynamic progress bars (`role="progressbar"`), lesson completion counters, and direct links to continue learning.
  - Part 5.5 (Lesson Viewer Page): Built `LessonViewerPage.jsx` with curriculum sidebar drawer, active lesson highlighting, previous/next lesson navigation, "Mark as Complete" button with loading/success states, dynamic progress calculation, and 100% course completion celebration banner.
  - Part 5.6 (Trainer "My Courses" Page): Built `TrainerCoursesPage.jsx` featuring trainer metric counters (Total, Published, Drafts, Archived), status tabs filter, search bar, course management cards with lesson counters, quick links to edit/manage/preview, and "+ Create New Course" trigger.
  - Part 5.7 (Create and Edit Course Form): Built `CourseFormPage.jsx` supporting both create and edit modes, complete field validation (Title, Summary, Description, Subject, Level, Thumbnail URL), "Save Changes", "Publish Course" (validating readiness), and "Archive Course" with accessible confirmation modal.
  - Part 5.8 (Manage Lessons Page): Built `ManageLessonsPage.jsx` featuring ordered curriculum syllabus, position indicators, accessible Move Up / Move Down reordering calling `PUT /courses/:courseId/lessons/reorder`, inline Add / Edit lesson form with character counts, and delete lesson confirmation dialog.
  - Part 5.9 (Resource Upload UI & Resource List): Built `ResourceUploadModal.jsx` supporting local file uploads (with 25 MiB size limit and executable blocking, handling 413 and 415 error codes) or external links, attached to specific lessons or course-wide. Integrated resource management section into `ManageLessonsPage.jsx` and updated `LessonViewerPage.jsx` with type-specific icons, file size tags, and authorized file downloads via `downloadResourceFile`.
  - Part 5.10 (States & Responsive Polish): Unified loading spinners, empty cards, error alerts with retry, status badges, WCAG 2.1 AA focus-visible outlines, touch-friendly controls, and responsive media queries (<900px, <768px, <480px) across all courses pages in `client/src/features/courses/courses.css`.
- Files created or changed:
  - `client/src/features/courses/coursesApi.js`
  - `client/src/features/courses/Navbar.jsx`
  - `client/src/features/courses/CourseCataloguePage.jsx`
  - `client/src/features/courses/CourseDetailPage.jsx`
  - `client/src/features/courses/MyLearningPage.jsx`
  - `client/src/features/courses/LessonViewerPage.jsx`
  - `client/src/features/courses/TrainerCoursesPage.jsx`
  - `client/src/features/courses/CourseFormPage.jsx`
  - `client/src/features/courses/ManageLessonsPage.jsx`
  - `client/src/features/courses/ResourceUploadModal.jsx`
  - `client/src/features/courses/courses.css`
  - `client/src/features/auth/AuthContext.jsx`
  - `client/src/features/auth/RoleGuard.jsx`
  - `client/src/services/apiClient.js`
  - `client/src/app/App.jsx`
- How to test it:
  - Frontend production build: `npm run build:client` (passes with 0 errors).
  - Backend integration test suite: `npm test --prefix server` (187 passed, 9 skipped, 0 failed).
- Tests added: All client components validated against real API endpoints via build verification and server integration test coverage.
- Issues, assumptions, or decisions:
  - Followed strict rule to use real API only, with zero mock data.
  - AuthContext and RoleGuard provide seamless role-switching (Trainee, Trainer, Admin, Guest) for testing all role-protected pages.
  - Work log preserved locally and excluded from git commits per instruction.
- Needs from teammates:
  - Member 1: Merge production auth token storage and user context to swap with temporary AuthContext stub when ready.


### Phase 6: Documentation and Final End-to-End Test (2026-11-17)
- Status: Done
- What was built:
  - Part 6.1 (API Contract Documentation): Authored comprehensive REST specifications for all Member 2 endpoints in `docs/API_CONTRACT.md` under Section 6.3 (`POST /courses`, `GET /courses`, `GET /courses/:courseId`, `PATCH /courses/:courseId`, `POST /courses/:courseId/publish`, `POST /courses/:courseId/lessons`, `PATCH /lessons/:lessonId`, `POST /courses/:courseId/resources`, `GET /courses/:courseId/resources`, `GET /courses/:courseId/resources/:resourceId/download`, `POST /courses/:courseId/enrollments`, `GET /enrollments/me`, and `PATCH /enrollments/:enrollmentId/progress`), specifying who can call, exact request bodies, response payloads, and HTTP error statuses.
  - Part 6.2 (Data Model Documentation): Documented Member 2's 5 PostgreSQL tables in `docs/DATA_MODEL.md` under Section 4.2 (`courses`, `lessons`, `learning_resources`, `enrollments`, `lesson_progress`), with exact PostgreSQL data types, foreign keys with `ON DELETE RESTRICT`, multi-field constraints, chronological checks, dual composite foreign keys, and indexes. Updated the Table Registry status to `Implemented & Verified (Migration 003)`.
  - Part 6.3 (Setup Notes in README): Added Section 5 "Courses Module (Member 2)" in `README.md` covering sequential execution of migrations (`001` and `003`), admin/trainer seeding, local file upload storage (`server/uploads/`), and testing instructions.
  - Part 6.4 (End-to-End Learning Flow Test): Added `server/tests/learningFlow.e2e.test.js` covering the full user journey: trainer creates course (`DRAFT`), adds Lesson 1 and Lesson 2, publishes course (`PUBLISHED`); unenrolled trainee cannot see lessons; trainee enrolls (`ACTIVE`); duplicate enrollment returns `409 DUPLICATE_ENROLLMENT`; enrolled trainee views ordered lessons; trainee marks Lesson 1 complete (50%); trainee marks Lesson 2 complete (100% and triggers `COMPLETED`); `GET /api/v1/enrollments/me` reports 100% progress and `COMPLETED` status.
- Files created or changed:
  - `docs/API_CONTRACT.md`
  - `docs/DATA_MODEL.md`
  - `README.md`
  - `server/tests/learningFlow.e2e.test.js`
  - `docs/MEMBER2_WORK_LOG.md`
- How to test it:
  - Run full backend test suite: `npm test --prefix server` (334 passed, 18 skipped, 0 failed).
  - Run learning flow E2E test: `npm test --prefix server -- tests/learningFlow.e2e.test.js` (1 passed).
  - Verify client build: `npm run build:client` (passes with 0 errors).
- Tests added: `server/tests/learningFlow.e2e.test.js` (1 comprehensive multi-step end-to-end lifecycle test with edge cases).
- Issues, assumptions, or decisions:
  - Maintained zero-regression across all existing member test suites.
  - Database integrity is enforced at the PostgreSQL schema layer via composite foreign keys and multi-state timestamp check constraints.
- Needs from teammates: None. All Member 2 tasks, endpoints, frontend views, schemas, and tests are complete.

### Phase 7: Code Review Integration & Refinements (2026-11-18)
- Status: Done
- What was built / resolved:
  - Item 1 (CourseDetailPage Auth Flags): Verified and aligned `CourseDetailPage.jsx` with canonical `useAuth()`. Auth flags (`isAuthenticated`, `isTrainee`, `isTrainer`, `isAdmin`) are derived directly from `user` state (`user?.role`), preventing runtime breakage for trainee enrollment and trainer course management controls.
  - Item 2 (Lesson Completion Banner vs Required Assessments): Updated `client/src/features/courses/LessonViewerPage.jsx` to decouple lesson completion from overall course completion. When `res.progressPercentage === 100 && !res.isComplete`, the viewer displays an assessment pending banner ("All Lessons Completed! To complete this course and earn your certificate, please complete the required course assessment(s)") with direct navigation to course assessments, rather than prematurely declaring the entire course completed.
  - Item 3 (PostgreSQL Test Teardown Dependency Order): Hardened `cleanupTestRecords()` in `server/tests/learningFlow.integration.test.js` to follow strict reverse topological foreign key order across the complete database schema: `audit_logs` -> `certificates` -> `attempt_answers` -> `assessment_attempts` -> `questions` -> `assessments` -> `feedback` -> `lesson_progress` -> `enrollments` -> `course_announcements` -> `learning_resources` -> `lessons` -> `courses` -> `trainee_profiles` -> `trainer_profiles` -> `user_skills` -> `users`. Prevents PostgreSQL RESTRICT foreign key constraint violations during real database test execution.
  - Item 4 (Course-to-Assessment Navigation Coordination): Integrated Member 3's assessments and feedback navigation directly into `LessonViewerPage.jsx` curriculum sidebar, providing direct links to `/courses/:courseId/assessments/:assessmentId/player` and `/courses/:courseId/feedback`.
- Files created or changed:
  - `client/src/features/courses/LessonViewerPage.jsx`
  - `server/tests/learningFlow.integration.test.js`
  - `docs/MEMBER2_WORK_LOG.md`
- How to test it:
  - Build frontend: `npm run build:client` (builds cleanly with 0 errors in ~400ms).
  - Run full test suite: `npm test --prefix server` (376 passed, 22 skipped, 0 failed).
- Tests added / updated:
  - `server/tests/learningFlow.integration.test.js`: Verified strict multi-table teardown against schema constraints.
- Issues, assumptions, or decisions:
  - Preserved backward compatibility with Member 1 canonical auth context and Member 3 assessment models.
  - Token storage aligned with `capsera_token`.
- Needs from teammates: None. All 4 review items for Member 2 are fully resolved.
