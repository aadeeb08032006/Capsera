# CAPSERA — Technical Decision Records (`DECISIONS.md`)

This document tracks architectural and technical decisions that refine or operationalize [PRD v1.0](./PRD.md). Per Section 19 of the PRD, shared technical choices and PRD baseline amendments require review and approval by all four team members.

---

## Decision Summary

| ID | Title | Status | Owner / Proposer |
|---|---|---|---|
| ADR-001 | Standardize SQL access on `mysql2/promise` with parameterized queries | **SUPERSEDED by ADR-002** | Member 4 (Foundation Setup) |
| ADR-002 | Migrate RDBMS from MySQL to PostgreSQL (`pg` connection pool + `$1..$n` parameterized queries) per Faculty Requirement | **PROPOSED (Pending Formal Team Approval)** | Member 4 (Foundation Setup) |
| ADR-003 | Establish Single Source of Truth for PostgreSQL Schema (`docs/DATA_MODEL.md` + `database/migrations/`) & Proposed PRD Section 12 "Database Schema Guidelines" Subsection | **PROPOSED (Pending Formal Team Approval)** | Member 4 (Foundation Setup) |
| ADR-004 | CP-02 Complete Proposed 18-Table PostgreSQL Schema (Post-Audit Correction Pass) & Module-Owner Sign-Off Items (`001`–`005` migrations) | **PROPOSED (Pending Formal Team Approval)** | Member 4 (CP-02 Schema Design) |
| ADR-005 | Verbatim Restoration Proposal for Truncated Sections 13–20 in `docs/PRD.md` (Matches Authoritative `CAPSERA_PRD_v1.0.docx`) | **PROPOSED (Pending Formal Team Approval)** | Member 4 (CP-02 Audit Pass) |
| OPEN-001 | Frontend HTTP Client (`fetch` vs `axios`) | **UNRESOLVED (Pending Team Decision)** | All Members |
| OPEN-002 | Authentication Transport & Session Strategy (HttpOnly Cookie vs Bearer Token) | **UNRESOLVED (Pending Member 1 & Team Decision)** | Member 1 |
| OPEN-003 | Request Validation Library / Shared Helper Pattern | **UNRESOLVED (Pending Team Decision)** | All Members |
| OPEN-004 | Certificate Status Representation (`issued_at` + nullable `revoked_at`) & Revocation Re-Issuance Policy | **PROPOSED in ADR-004 (`SCHEMA-M4-02`, Pending Team Approval)** | Member 4 |
| OPEN-005 | Duplicate Enrollment & Duplicate Attempt Submission Semantics (`409` vs Idempotent `200`) | **UNRESOLVED (Pending Members 2, 3 & Team Decision)** | Members 2 & 3 |
| OPEN-006 | Test Runner Selection (Backend & Frontend) | **UNRESOLVED (Pending Team Decision)** | All Members |
| OPEN-007 | Enrollment Cancellation & Re-Enrollment Policy (`enrollments`) | **UNRESOLVED (Pending Member 2 & Team Decision)** | Member 2 |
| OPEN-008 | Migration Version Ledger (`schema_migrations`) & Execution Runner Strategy | **PROPOSED (Pending Formal Team Approval)** | All Members |
| OPEN-009 | Durable Audit Event Persistence (`audit_logs` Infrastructure Table Proposal for PRD Section 8.1) | **APPROVED (Team Decision)** | All Members |

---

## ADR-002: Database Migration from MySQL 8+ to PostgreSQL (`pg` Pool & Parameterized Queries)

- **Status:** PROPOSED — Required by Faculty; Pending Formal Approval from Members 1, 2, 3, and 4
- **Supersedes:** ADR-001 (`mysql2/promise`)
- **Date:** 2026-11-03

### 1. Requirement & Sections Being Changed (PRD Section 19 Change Control)
Our course faculty requires the project to use **PostgreSQL** instead of **MySQL**. Because [docs/PRD.md](./PRD.md) v1.0 is the finalized baseline, it has **not** been silently rewritten. Instead, the exact PRD v1.0 sections requiring formal amendment upon team sign-off are flagged below.

### 2. Reason and Expected Value
- Satisfies the mandatory academic/faculty evaluation requirement for PostgreSQL.
- Preserves all CAPSERA relational integrity guarantees (ACID transactions, foreign keys, unique constraints, composite indexes, and parameterized SQL queries) without introducing an unapproved ORM.

### 3. Scope, Time, and Data/API Compatibility Impact
- **Scope/Time Impact:** Minimal — the switch occurs at the foundation stage before any application business modules or SQL migrations have been implemented.
- **Database Name & API Prefix:** Unchanged (`capsera_db` and `/api/v1`).
- **Naming Conventions:** Unchanged (plural `snake_case` SQL tables and `snake_case` columns; `camelCase` JSON API fields).
- **Driver & Parameter Syntax Impact:**
  - Replace `mysql2` with `pg` (`node-postgres`) using `pg.Pool` in [server/src/config/db.js](../server/src/config/db.js).
  - Default database port changes from `3306` to `5432` (default user `postgres`).
  - Parameterized SQL queries use PostgreSQL positional placeholders (`$1, $2, ...`) via `executeQuery(text, params)` / `pool.query(text, params)` instead of `?`.
  - Transactions use `const client = await pool.connect()` with `BEGIN`, `COMMIT`, `ROLLBACK`, and `client.release()` via `withTransaction(work)`.

---

### 4. Exact Sections of CAPSERA PRD v1.0 Flagged for Amendment

Do **not** edit [docs/PRD.md](./PRD.md) until all four members check off approval below. Once approved, apply the following targeted replacements to `docs/PRD.md`:

| PRD v1.0 Location | Current Text in `docs/PRD.md` | Proposed Amendment Text |
|---|---|---|
| **Document Header Metadata** | `Technology: React + Vite, Node.js + Express, MySQL` | `Technology: React + Vite, Node.js + Express, PostgreSQL` |
| **Section 3.1 — Goals for the MVP** | `Deliver an end-to-end demo using a real MySQL database, not only mock data or localStorage.` | `Deliver an end-to-end demo using a real PostgreSQL database, not only mock data or localStorage.` |
| **Section 6.4 — Lessons and resources** | `Store uploaded files in a suitable storage service; store metadata and access references in MySQL. Large media binaries should not be stored in relational rows.` | `Store uploaded files in a suitable storage service; store metadata and access references in PostgreSQL. Large media binaries should not be stored in relational rows.` |
| **Section 8.3 — Reliability and data integrity** | `MySQL is the source of truth for user, course, enrollment, assessment, progress, feedback, and certificate records.` | `PostgreSQL is the source of truth for user, course, enrollment, assessment, progress, feedback, and certificate records.` |
| **Section 8.4 — Performance and scalability** | `Keep uploaded media in file/object storage rather than MySQL.` | `Keep uploaded media in file/object storage rather than PostgreSQL.` |
| **Section 9.1 — Approved stack** | `- **Database:** MySQL 8+ using InnoDB.`<br>`- **SQL access:** choose one approach centrally (recommended: mysql2/promise with parameterized queries, or an agreed ORM; do not mix access patterns across modules).`<br>`- **Deployment:** static frontend hosting plus Node API hosting and managed MySQL, depending on free-tier availability.` | `- **Database:** PostgreSQL 15+ (with ACID transactions and relational constraints).`<br>`- **SQL access:** choose one approach centrally (recommended: pg / node-postgres Pool with parameterized queries ($1, $2, ...), or an agreed ORM; do not mix access patterns across modules).`<br>`- **Deployment:** static frontend hosting plus Node API hosting and managed PostgreSQL, depending on free-tier availability.` |
| **Section 9.2 — Architecture** | `Browser (React/Vite) → REST API (Node/Express) → MySQL`<br>`The browser must not connect directly to MySQL.` | `Browser (React/Vite) → REST API (Node/Express) → PostgreSQL`<br>`The browser must not connect directly to PostgreSQL.` |
| **Section 11.1 — General rules** | `IDs are generated by the database and never trusted from public signup payloads for ownership or role.` *(Note: referenced as MySQL in API_CONTRACT.md)* | Keep PRD rule; ensure `API_CONTRACT.md` references PostgreSQL identity/serial generation. |
| **Section 17 — Assumptions and constraints** | `The selected database is MySQL; this is not a MERN application.` | `The selected database is PostgreSQL (per faculty requirement); this is not a MERN application.` |
| **Section 20 — Final MVP definition** | `The system must use the agreed React/Vite, Express, and MySQL stack, enforce server-side permissions, and be usable on mobile and desktop.` | `The system must use the agreed React/Vite, Express, and PostgreSQL stack, enforce server-side permissions, and be usable on mobile and desktop.` |

### 5. Approval Checklist (Required by PRD Section 19)
- [ ] Member 1 (Identity, Profiles, Governance)
- [ ] Member 2 (Courses, Lessons, Resources, Enrollments)
- [x] Member 3 (Assessments, Attempts, Progress, Feedback)
- [ ] Member 4 (Competency, Certificates, Announcements, Admin Dashboard)

---

## ADR-003: Single Source of Truth for PostgreSQL Schema & Proposed PRD Section 12 Amendment ("Database Schema Guidelines")

- **Status:** PROPOSED — Pending Formal Approval from Members 1, 2, 3, and 4
- **Date:** 2026-11-03
- **Related Documents:** [docs/PRD.md](./PRD.md) (Section 12 — Conceptual data model, Section 19 — Change control), [docs/DATA_MODEL.md](./DATA_MODEL.md), `database/migrations/`

### 1. Schema Reference Inspection & Selection
- **Repository Inspection:** A search of `docs/` and `database/` confirmed that no standalone authoritative SQL file (such as `schema.sql`) has been provided or designated by the team lead.
- **Selected Schema Reference Path:** `docs/DATA_MODEL.md` is designated as the proposed schema design reference (single source of truth for design), with `database/migrations/` containing the executable, versioned PostgreSQL migrations for `capsera_db`.

### 2. Reason and Expected Value
- Prevents schema drift, duplicate entities, conflicting foreign keys, or uncoordinated column names across the four parallel module owners (Members 1–4).
- Aligns with **CAPSERA PRD v1.0** Section 12 (*"The exact schema will be documented in `DATA_MODEL.md` and implemented as versioned migrations"*) and **ADR-002** (PostgreSQL substitution).

### 3. Scope, Time, and Data/API Compatibility Impact
- **Scope/Time Impact:** Documentation-only governance rule; zero impact on delivery timeline.
- **Data/API Compatibility Impact:** Ensures all modules reference identical plural `snake_case` PostgreSQL table names, `snake_case` columns, primary/foreign keys, and constraints.

### 4. Proposed Amendment to `docs/PRD.md` (Section 12 — Conceptual data model)

Because `docs/PRD.md` is the finalized v1.0 baseline, it has **not** been modified directly. Upon formal team approval, append the following subsection to **Section 12 (`Conceptual data model`)** of `docs/PRD.md`:

```markdown
### 12.1 Database Schema Guidelines

`docs/DATA_MODEL.md` serves as the proposed schema design reference for the `capsera_db` PostgreSQL database, with `database/migrations/` containing the executable PostgreSQL migrations.

- All team members must follow the agreed PostgreSQL schema.
- The schema reference (`docs/DATA_MODEL.md`) defines table names, columns, primary keys, foreign keys, relationships, and constraints.
- Approved schema changes must be implemented using versioned migrations in `database/migrations/`.
- No member may independently introduce duplicate entities, incompatible column names, or conflicting relationships.
- Shared schema changes require team discussion and approval.
```

### 5. Approval Checklist (Required by PRD Section 19)
- [ ] Member 1 (Identity, Profiles, Governance)
- [ ] Member 2 (Courses, Lessons, Resources, Enrollments)
- [x] Member 3 (Assessments, Attempts, Progress, Feedback)
- [ ] Member 4 (Competency, Certificates, Announcements, Admin Dashboard)

---

## ADR-004: CP-02 Proposed Complete 18-Table PostgreSQL Relational Schema (Post-Audit Correction Pass) & Owner Sign-Off Items

- **Status:** PROPOSED — Post-Audit Correction Pass Complete; Pending Formal Review & Approval from Members 1, 2, 3, and 4
- **Date:** 2026-11-03
- **Related Artifacts:** [docs/DATA_MODEL.md](./DATA_MODEL.md), `database/migrations/001_*.sql` through `005_*.sql`, [database/migrations/README.md](../database/migrations/README.md)

### 1. Context & Governance Boundary
The team agreed to begin designing the shared PostgreSQL schema (CP-02). Agreeing to begin design does **not** constitute final schema approval. All 18 canonical entities from **PRD Section 10.4** have been documented in `docs/DATA_MODEL.md`, audited via static PostgreSQL DDL analysis, and prepared as numbered, dependency-ordered PostgreSQL migrations (`001`–`005`) **without** automatically applying them to `capsera_db` and **without** introducing any unapproved tables into `001`–`005`.

### 2. Unsettled Schema Decisions Flagged for Teammate Review

Every column, constraint, or cross-module lifecycle rule not explicitly prescribed by PRD v1.0 is itemized below by owner so each member can verify or request adjustments before migration application:

#### Shared / Cross-Module Decisions (All Four Members)
- **`SCHEMA-SHARED-01` — Identity PKs, Enum CHECKs, Composite Parent-Matching FKs & `ON DELETE RESTRICT`:**
  - All 18 tables use `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `TIMESTAMPTZ` (UTC), `VARCHAR` + named `CHECK` constraints for PRD uppercase enums, composite parent-matching foreign keys on `learning_resources`, `lesson_progress`, and `attempt_answers`, and `ON DELETE RESTRICT` (except `users.approved_by` which uses `ON DELETE SET NULL`) to preserve historical learning records.
- **`SCHEMA-SHARED-02` — Collective Plural Table Names (`lesson_progress` & `feedback`):**
  - Retains exact table names `lesson_progress` and `feedback` as written in PRD Section 12 and CP-02 ownership rather than `lesson_progresses` / `feedbacks`.
- **`SCHEMA-SHARED-03` — `updated_at` Maintenance & Durable PRD 8.1 Audit Persistence (`OPEN-009`):**
  - `updated_at` is set explicitly via `updated_at = CURRENT_TIMESTAMP` in parameterized `UPDATE` queries (avoiding hidden PL/pgSQL triggers unless requested by the team).
  - **Audit Event Persistence (PRD Section 8.1):** Ephemeral console/`stdout` logs do **not** satisfy durable audit event requirements for *"admin approval, role changes, suspension, and certificate issuance,"* and in-place updates on `users.role`/`users.status` overwrite prior state. To respect the strict 18-table domain boundary in `001`–`005`, `OPEN-009` below proposes a formal four-member deviation adding an append-only `audit_logs` infrastructure table (`006_create_audit_logs.sql`).
- **`SCHEMA-SHARED-04` — Migration Version Ledger (`OPEN-008`):**
  - Raw `psql -f` has no applied-version ledger for incremental `006+` migrations across four developers. `OPEN-008` below proposes a lightweight `schema_migrations` ledger table + Node runner script for team approval.

#### Member 1 Review Items (`001_create_users_and_profiles.sql` — `users`, `trainee_profiles`, `trainer_profiles`)
- **`SCHEMA-M1-01` — `users` Naming, DTO Field Alignment & Governance Columns:**
  - Confirm `full_name VARCHAR(150)` in SQL and standardize **one** JSON field name (`fullName` vs `name` in PRD FR-01) across `/auth/signup`, `/auth/me`, and `/certificates/verify/:code` in `docs/API_CONTRACT.md` (PRD Section 10.2 forbids field synonyms).
  - Confirm single case-insensitive expression unique index `uq_users_email_ci ON users (LOWER(email))` (replacing redundant `UNIQUE (email)`), and proposed admin-approval columns `approved_by BIGINT NULL` and `approved_at TIMESTAMPTZ NULL`.
- **`SCHEMA-M1-02` — Profile Field Types & Prior Credentials:**
  - Confirm `TEXT` (vs structured `JSONB`) for `qualifications` and `work_experience` in `trainee_profiles` and `trainer_profiles`.
  - Confirm `trainee_profiles.external_certifications TEXT NULL` for prior external resume credentials (distinct from CAPSERA completion records in `certificates`).
- **`SCHEMA-M1-03` — Role-Transition & Mutual-Exclusion Profile Policy:**
  - Confirm backend enforcement preventing dual rows in `trainee_profiles` + `trainer_profiles` and rejecting `PATCH /api/v1/admin/users/:userId/role` (`409 Conflict`) whenever role-bound profile or domain records (`courses`, `trainer_skills`, `enrollments`, `trainee_skills`, `assessment_attempts`, `feedback`, `certificates`, `announcements`) already exist — or restricting role edits strictly to `status = 'PENDING'` users before approval.

#### Member 1 Responses (proposed)
- **SCHEMA-M1-01:** Confirmed. JSON key is `fullName`; SQL column stays `full_name`. Keep `uq_users_email_ci` and `approved_by` / `approved_at`. The server trims and lowercases email before every insert and lookup. API ids are returned as strings (BIGINT), so every module follows the same rule.
- **SCHEMA-M1-02:** Confirmed. `qualifications` and `work_experience` stay `TEXT`; keep `trainee_profiles.external_certifications`. `yearsOfExperience` is returned as a number.
- **SCHEMA-M1-03:** Role changes are allowed only while `status = 'PENDING'`; any other role-change request returns `409`. A user never has both profile rows. `PUT /profiles/me/*` creates the profile row on first save (upsert).

#### Member 2 Review Items (`003_create_courses_lessons_and_enrollments.sql` — `courses`, `lessons`, `learning_resources`, `enrollments`, `lesson_progress`)
- **`SCHEMA-M2-01` — `courses` Draft vs Published Fields, Lifecycle Timestamps & Level Values:**
  - Confirm optional `summary VARCHAR(500)`, `level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')`, `chk_courses_published_fields`, and `chk_courses_lifecycle_timestamps` (`PUBLISHED` requires `published_at IS NOT NULL AND archived_at IS NULL`; `ARCHIVED` requires `archived_at IS NOT NULL` and `>= published_at`).
- **`SCHEMA-M2-02` — `lessons` Non-Deferrable Ordering (`ON CONFLICT` Support), `learning_resources` & Curriculum Mutation Policy:**
  - Confirm keeping `uq_lessons_course_order UNIQUE (course_id, lesson_order)` **non-deferrable** so PostgreSQL `INSERT ... ON CONFLICT (course_id, lesson_order)` works (PostgreSQL rejects `DEFERRABLE` unique constraints as `ON CONFLICT` arbiters; if two-step in-place swap reordering inside a transaction is preferred over `ON CONFLICT`, Member 2 may opt into `DEFERRABLE` explicitly).
  - Confirm `learning_resources` metadata columns and composite FK `(course_id, lesson_id) REFERENCES lessons (course_id, id)`.
  - Confirm post-completion curriculum mutation rule: whether structural lesson/required-assessment additions are locked once active/completed enrollments exist, or existing `COMPLETED` enrollments and `certificates` remain immutable historical completions.
- **`SCHEMA-M2-03` — Derived Progress, Cross-Course `lesson_progress` FKs & 3-State Enrollment Timestamps:**
  - Confirm omitting stored progress percentage on `enrollments`, carrying `course_id BIGINT NOT NULL` on `lesson_progress` with dual composite FKs to `enrollments (course_id, id)` and `lessons (course_id, id)`, and 3-state mutually exclusive `chk_enrollments_status_timestamps`.
- **`SCHEMA-M2-04` — Cancellation & Re-Enrollment Policy (`OPEN-007`):**
  - Confirm whether a trainee whose enrollment is `'CANCELLED'` reactivates the existing row (`status = 'ACTIVE'`, `cancelled_at = NULL`), is barred from re-enrolling without Admin action, or requires a partial unique index (see `OPEN-007`).

#### Member 3 Review Items (`004_create_assessments_attempts_and_feedback.sql` — `assessments`, `questions`, `assessment_attempts`, `attempt_answers`, `feedback`)
- **`SCHEMA-M3-01` — `assessments` Pass Threshold, Required Flag, Publish Timestamp & `>= 1` Question Precondition:**
  - Confirm `pass_percentage NUMERIC(5,2) NOT NULL DEFAULT 60.00`, `is_required BOOLEAN NOT NULL DEFAULT TRUE`, `chk_assessments_published_timestamp`, mandatory transactional publish validation (`COUNT(questions) >= 1` so `total_points > 0`), and align `docs/API_CONTRACT.md` DTO names (`passPercentage` vs `passThreshold`, `deadlineAt` vs `deadline`).
  - Confirm whether a course may have multiple required published assessments (all of which must be passed) or at most one.
- **`SCHEMA-M3-02` — Four-Option MCQ Representation & Non-Deferrable `question_order`:**
  - Confirm explicit columns `option_a..option_d` (`TEXT NOT NULL`), `correct_option CHAR(1) CHECK (IN ('A','B','C','D'))`, matching `attempt_answers.selected_option CHAR(1) NULL`, and keeping `uq_questions_assessment_order UNIQUE (assessment_id, question_order)` **non-deferrable** for PostgreSQL `INSERT ... ON CONFLICT` compatibility.
- **`SCHEMA-M3-03` — Attempt Submission/Grading Checks, Cross-Assessment `attempt_answers` FKs & Stale Attempt Expiry:**
  - Confirm `chk_assessment_attempts_submission_timestamps` (`submitted_at` required on `'SUBMITTED'`/`'GRADED'`, `NULL` on `'IN_PROGRESS'`/`'EXPIRED'`), `chk_assessment_attempts_graded_fields`, `idx_assessment_attempts_assessment_status_pass`, and transactional expiry sweep transitioning timed-out `'IN_PROGRESS'` rows to `'EXPIRED'` before creating a retry under `uq_assessment_attempts_one_in_progress`.
  - Confirm carrying `assessment_id BIGINT NOT NULL` on `attempt_answers` with dual composite FKs to `assessment_attempts (assessment_id, id)` and `questions (assessment_id, id)`, plus `feedback.comment VARCHAR(2000)` max length.

#### Member 3 Responses (proposed)
- **SCHEMA-M3-01:** Confirmed. Keep `pass_percentage`, `deadline_at`, `is_required`, and `published_at`. JSON API DTOs use `camelCase` (`passPercentage`, `deadlineAt`, `isRequired`, `publishedAt`, `durationMinutes`, `maxAttempts`) and string IDs (`BIGINT`). Publishing checks `COUNT(questions) >= 1` (`SUM(points) > 0`) inside a transaction; empty assessments return `409 ASSESSMENT_EMPTY`. Multiple required published assessments per course are allowed; course completion requires passing all published assessments with `is_required = TRUE` alongside 100% lesson completion. Once an assessment has recorded attempts, structural scoring changes (`passPercentage`, `maxAttempts`, `durationMinutes`, `isRequired`, and question edits/deletes affecting `correctOption` or `points`) are rejected with `409 ASSESSMENT_LOCKED`.
- **SCHEMA-M3-02:** Confirmed. Keep `option_a`..`option_d`, `correct_option` (`'A'`..`'D'`), `question_order`, and non-deferrable `uq_questions_assessment_order`. JSON DTO uses `questionOrder`, `questionText`, `optionA`..`optionD`, `correctOption`, `explanation`, and `points`. Trainee pre-submit payloads omit `correctOption` and `explanation`.
- **SCHEMA-M3-03:** Confirmed. Keep submission/grading timestamp checks, partial unique `IN_PROGRESS` index, transactional expiry sweep (`IN_PROGRESS` -> `EXPIRED` when timed out), dual composite FKs on `attempt_answers`, and `feedback.comment` max length `2000`.

#### Member 4 Review Items (`002_*.sql` & `005_*.sql` — `skills`, `trainee_skills`, `trainer_skills`, `certificates`, `announcements`)
- **`SCHEMA-M4-01` — Skill Expression Index (`LOWER(name)`), Proficiency Scale & Timestamps:**
  - Confirm `uq_skills_name_ci ON skills (LOWER(name))` (matching `WHERE LOWER(name) = LOWER($1)`), `CHECK (proficiency BETWEEN 1 AND 4)` (`1 = BEGINNER .. 4 = EXPERT`), `skills.category NOT NULL`, and whether `trainee_skills`/`trainer_skills` intentionally omit `created_at`/`updated_at`.
- **`SCHEMA-M4-02` — Certificate Status, Trigger Ownership & Revocation Re-Issuance Policy (`OPEN-004`):**
  - Confirm representing certificate validity via `issued_at TIMESTAMPTZ NOT NULL` and `revoked_at TIMESTAMPTZ NULL` (`NULL` = active/valid), decide whether revocation is permanent under `UNIQUE (trainee_id, course_id)` or if re-issuance requires clearing/updating vs partial uniqueness (`WHERE revoked_at IS NULL`), and decide whether certificate issuance runs eagerly inside Member 2/3 completion transactions via a shared service helper or lazily on `GET /api/v1/certificates/me`.
- **`SCHEMA-M4-03` — Announcement Categories & Statuses:**
  - Confirm `announcements.category IN ('ANNOUNCEMENT', 'ACHIEVEMENT', 'NEW_CONTENT')` (PRD Section 6.10) and `announcements.status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')`.

### 3. Approval Checklist (Required Before Applying Migrations to Shared DB)
- [ ] Member 1 (Approves `001` & shared conventions)
- [ ] Member 2 (Approves `003` & shared conventions)
- [x] Member 3 (Approves `004` & shared conventions)
- [ ] Member 4 (Approves `002`, `005` & shared conventions)

---

## ADR-005: Verbatim Restoration Proposal for Truncated Sections 13–20 in `docs/PRD.md`

- **Status:** PROPOSED — Pending Formal Verification & Approval from Members 1, 2, 3, and 4
- **Date:** 2026-11-03
- **Related Documents:** [docs/PRD.md](./PRD.md) (lines 595–616), Authoritative `CAPSERA_PRD_v1.0.docx`, `ADR-002`

### 1. Exact Inspection Findings (`docs/PRD.md` vs Authoritative CAPSERA PRD v1.0)
A line-by-line inspection comparing [docs/PRD.md](./PRD.md) against the authoritative `CAPSERA_PRD_v1.0.docx` confirmed that Sections 1 through 12 are present, but **lines 595–616 of `docs/PRD.md` are condensed/truncated**:
1. **Section 13 (`## 13. Four-member work allocation`, lines 595–604):** Condensed into 4 single-paragraph bullets; omits the opening two-sentence preamble and omits the entire **`### Equal-work policy`** subsection.
2. **Section 14 (`Suggested delivery plan (2–4 weeks)`):** Completely omitted (including `Week 1` through `Week 4` subsections and the two-week deadline deferral rule).
3. **Section 15 (`Testing and definition of done`):** Completely omitted (including the 7-item Definition of Done and the 15-item `Minimum end-to-end test scenarios` subsection).
4. **Section 16 (`Risks and mitigations`):** Completely omitted (9-row risk/mitigation table).
5. **Section 17 (`Assumptions and constraints`):** Completely omitted (8 bullets — including the database constraint line referenced by `ADR-002`).
6. **Section 18 (`Reference research and inspiration`):** Completely omitted (7 SIH26075 reference bullets + `Research interpretation` subsection).
7. **Section 19 (`Change control and approval`):** Misnumbered at line 606 of `docs/PRD.md` as `## 14. Change control and approval` and omits its final sentence (*"Individual members or AI assistants must not independently introduce competing names, routes, role values, status values, or duplicate entities."*).
8. **Section 20 (`Final MVP definition`) & Document Footer:** Completely omitted (including the final MVP stack sentence referenced by `ADR-002` and `End of PRD — Version 1.0`).

### 2. Verbatim Restoration Text (Replace Lines 595–616 of `docs/PRD.md` Upon Team Approval)
Per guardrails, [docs/PRD.md](./PRD.md) has **not** been modified directly, and zero text has been invented. Below is the **exact verbatim text** extracted from the authoritative `CAPSERA_PRD_v1.0.docx` (preserving original v1.0 wording; once both `ADR-005` and `ADR-002` are approved, apply `ADR-002`'s targeted MySQL → PostgreSQL substitutions to Sections 17 and 20):

```markdown
## 13. Four-member work allocation

The goal is balanced end-to-end ownership, not four disconnected codebases. Every member is responsible for their module's UI, API integration, database operations, validation, tests, and documentation.

### Member 1 — Identity, profiles, and user governance
- Signup/login/logout/current user.
- Authentication and authorization middleware.
- Trainee/trainer profiles.
- Admin approval, role/status management.
- Owns canonical `User`, `TraineeProfile`, `TrainerProfile` contracts.
- Shared responsibility for security review.

### Member 2 — Courses and learning resources
- Course CRUD, publish/archive.
- Lessons and resource library/upload metadata.
- Course discovery, enrollment, lesson progress API integration.
- Owns `Course`, `Lesson`, `LearningResource`, `Enrollment`, `LessonProgress` implementation.
- Shared responsibility for end-to-end learning-flow testing.

### Member 3 — Assessments, results, progress, and feedback
- Assessment creation/settings and MCQ question management.
- Attempt lifecycle, scoring, result review, attempt history.
- Progress rule integration and feedback.
- Owns `Assessment`, `Question`, `AssessmentAttempt`, `AttemptAnswer`, `Feedback` implementation.
- Shared responsibility for transactional integrity and assessment security tests.

### Member 4 — Competency, certificates, announcements, and dashboard
- Skill catalogue and trainee/trainer skill mapping.
- Explainable trainer recommendation logic.
- Basic certificate issuance/verification.
- Homepage announcements and admin summary metrics.
- Owns `Skill`, `TraineeSkill`, `TrainerSkill`, `Certificate`, `Announcement`, dashboard queries.
- Shared responsibility for system-level integration and demo readiness.

### Equal-work policy
- All four members implement frontend + backend + database work in their owned module.
- All four write tests and review at least one teammate’s pull request per milestone.
- Member 4 is not solely responsible for all integration, documentation, or deployment; tasks are shared and tracked.
- Rebalance if estimated effort diverges materially. A module owner is responsible for its contract, not allowed to change shared conventions unilaterally.

## 14. Suggested delivery plan (2–4 weeks)

This is a target schedule, not a guarantee. It assumes all four members work consistently and use AI-assisted coding while reviewing and testing generated changes.

### Week 1 — Align and build the vertical slice
- Finalize this PRD and API/data contracts.
- Establish repository conventions, environment examples, migrations, seeds, linting, and test commands.
- Implement authentication, role guards, and user approval.
- Build a thin end-to-end path: trainer creates/publishes course → trainee enrolls → lesson completion persists.

### Week 2 — Assessments and core modules
- Implement assessment/question creation, attempt submission, server-side scoring, and results.
- Connect progress calculation and certificate eligibility.
- Implement skill mapping and basic trainer recommendations.
- Integrate feedback and initial admin metrics.

### Week 3 — Complete admin and polish (if available)
- Announcements and certificate verification.
- Complete profile and resource upload flows.
- Add empty/loading/error states, responsive refinements, and demo seed data.
- Run cross-role permission tests and end-to-end tests.

### Week 4 — Stabilize and present (if available)
- Fix integration bugs, deploy, verify environment configuration and database migrations.
- Prepare user journeys, screenshots, demo script, architecture/data-flow diagrams, and limitations.
- Freeze feature scope; only critical bug fixes after freeze.

For a strict two-week deadline, defer polished PDF certificates, charts, password-reset email automation, and any optional visual enhancements before compromising authentication, scoring integrity, or the end-to-end learning flow.

## 15. Testing and definition of done

A feature is “done” only when:
- The UI works for its intended role.
- The API validates input and enforces authentication, role, and ownership.
- Database changes persist and obey constraints.
- Loading, empty, success, validation, and failure states are handled.
- Tests cover the main success path and at least one unauthorized/invalid path.
- API contract and PRD changes are documented.
- The change is merged through a reviewed pull request and does not break the main branch.

### Minimum end-to-end test scenarios
- Pending user cannot log in or call protected APIs.
- Admin can approve a trainee and a trainer.
- Trainee cannot self-assign Admin or change another user's role.
- Trainer A cannot edit Trainer B’s course or view private results for it.
- Trainee cannot enroll in a draft/archived course.
- Duplicate enrollment is blocked.
- Unenrolled trainee cannot access restricted resources or assessments.
- Client cannot forge assessment score or pass status.
- Expired assessment cannot be submitted.
- Attempt limit is enforced, including concurrent submission attempts.
- Course progress is computed from persisted lesson records.
- Certificate cannot be issued before eligibility and cannot be duplicated.
- Announcement drafts/expired items are hidden from the homepage.
- Recommendation results exclude pending/suspended trainers.
- Dashboard values match test database records.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Four AI coding sessions produce inconsistent names or architecture | Treat this PRD and `API_CONTRACT.md` as mandatory shared context; centralize changes |
| Integration begins too late | Build a vertical slice in Week 1; merge small PRs frequently |
| Vibe-coded features look functional but use mock data | Require database-backed acceptance tests for every P0 feature |
| Assessment answers leak to browser | Use role-specific DTOs and server-side scoring; test response payloads |
| Uploaded content becomes publicly accessible | Use controlled storage, signed URLs or authorized downloads, and server-side permission checks |
| Scope expands beyond the deadline | Keep deferred features explicitly out of MVP and require a scope-change decision |
| Admin account cannot be created for testing | Document a secure seed/provisioning procedure; never add public admin signup |
| Demo data is mistaken for real metrics | Clearly label demo data and avoid unsupported impact claims |
| Cloud service/free-tier changes delay deployment | Keep local development reproducible and document an alternate demo plan |

## 17. Assumptions and constraints

- The team has an initialized Git repository named `capsera`; this document does not assume its current files or branches.
- The product name is CAPSERA, regardless of the source SIH problem statement’s name CAPACITY CONNECT.
- The selected database is MySQL; this is not a MERN application.
- The product is a student project inspired by SIH26075, not an official MoES/IMD production deployment.
- The team has four members and expects a 2–4 week delivery window.
- No external dataset is required for the MVP; demo courses, skills, users, and questions can be seeded with synthetic data.
- Cloud storage, email delivery, and public hosting depend on account availability and may require documented fallback behaviour.
- Advanced features are not implied by aspirational reference-repository descriptions.

## 18. Reference research and inspiration

The following public repositories were reviewed as inspiration. Their READMEs and documented feature descriptions were used to compare ideas; this is not a guarantee that every claimed feature works, nor an exhaustive code/security audit.
- **Official problem statement mirror — SIH26075:** https://github.com/vedantchalke36/sih-2026-problem-statements/blob/main/ps_2026/SIH26075.md — Used as the baseline for the required three roles, resources, assessments, feedback, admin capabilities, and competency mapping.
- **ASTALAKSHMI-S / -capacity-connect:** https://github.com/ASTALAKSHMI-S/-capacity-connect — Inspiration: trainee information architecture, course explorer, learning player, competency and skill-gap views, assessment history, feedback. Its README notes mock/localStorage auth and incomplete trainer/admin modules, so CAPSERA requires real API/database integration.
- **MiljotSinghK / Capacity-Connect:** https://github.com/MiljotSinghK/Capacity-Connect — Inspiration: closed-loop competency model linking skills, gaps, trainer/course matching, assessment, and credentials; also emphasizes authorization and assessment integrity. Advanced ML, adaptive streaming, queues, and device fingerprinting are not MVP requirements.
- **umesh1177 / sih_2026:** https://github.com/umesh1177/sih_2026 — Inspiration: institutional role model, trainer-subject mapping, assessment lifecycle, and basic result analytics. Kiosk proctoring and AI question generation are deferred.
- **bhanu123-vs / CAPACITY-CONNECT:** https://github.com/bhanu123-vs/CAPACITY-CONNECT — Inspiration: SIH context, approval flow, password hashing, server-side role checks, responsive experience, and a relational-stack direction.
- **abhinav115032 / capacity-connect:** https://github.com/abhinav115032/capacity-connect — Additional SIH-related reference located during discovery; use as a comparison source, not as an authority for the final requirements.
- **anandpatel9044 / Capacity_Connect:** https://github.com/anandpatel9044/Capacity_Connect — Located during research; the public repository page appeared empty at the time reviewed, so no feature claims were adopted from it.

### Research interpretation
- SIH problem statement requirements take precedence over reference repositories.
- Reference projects may provide useful UX and workflow ideas, but repository claims are not independently verified functionality.
- CAPSERA should prefer explainable, deterministic matching over speculative AI for its first release.
- Real authorization, server-side scoring, persistent progress, and one complete learning journey matter more than a large number of incomplete screens.
- Use original implementation and UI design; do not copy another team’s code or assets without checking license and attribution requirements.

## 19. Change control and approval

This PRD is the finalized baseline for the MVP. Changes should be proposed through a short decision record containing:
1. Requirement/section being changed.
2. Reason and expected user value.
3. Scope/time impact.
4. Data/API compatibility impact.
5. Approval from all four members.

The shared API contract, naming registry, and database model must be updated alongside any approved change. Individual members or AI assistants must not independently introduce competing names, routes, role values, status values, or duplicate entities.

## 20. Final MVP definition

CAPSERA MVP is complete when an approved user can participate in the full learning lifecycle—profile and skills, trainer/course discovery, enrollment, lessons/resources, assessment, persisted results, progress, and eligible certificate—and when trainers/admins can securely manage the corresponding content and view the appropriate reports. The system must use the agreed React/Vite, Express, and MySQL stack, enforce server-side permissions, and be usable on mobile and desktop.

End of PRD — Version 1.0
```

### 3. Approval Checklist (Required Before Updating `docs/PRD.md`)
- [ ] Member 1 (Identity, Profiles, Governance)
- [ ] Member 2 (Courses, Lessons, Resources, Enrollments)
- [x] Member 3 (Assessments, Attempts, Progress, Feedback)
- [ ] Member 4 (Competency, Certificates, Announcements, Admin Dashboard)

---

## ADR-001: Database Access Layer — `mysql2/promise` with Parameterized Queries (Historical Record)

- **Status:** SUPERSEDED by **ADR-002** on 2026-11-03 due to faculty requirement for PostgreSQL.
- **Summary:** Originally proposed `mysql2/promise` against MySQL 8+ (`InnoDB`). Replaced by `pg` (`node-postgres`) connection pool with `$1, $2, ...` parameterized queries and `withTransaction` helper in `server/src/config/db.js`.

---

## Unresolved Decisions Requiring Team Agreement

### OPEN-001: Frontend HTTP Client (`fetch` vs `axios`)
- **PRD Reference:** Section 9.1 (*"HTTP client: Axios or `fetch`; team must standardize on one client."*)
- **Current Foundation State:** A minimal `fetch`-based wrapper is provided at `client/src/services/apiClient.js` for the initial `/api/v1/health` check so no unapproved third-party HTTP dependency is forced prematurely.
- **Action Required:** Team must confirm whether to keep native `fetch` via `apiClient.js` or install `axios` before feature modules are built.

### OPEN-002: Authentication Transport & Password Hashing Library
- **Status:** PROPOSED by Member 1 (pending team approval)
- **PRD Reference:** Sections 6.1 and 8.1.
- **Proposal:**
  1. **Transport:** JWT (HS256) sent as `Authorization: Bearer <token>`. No cookies, so no CSRF handling is needed, and it works with a separately hosted frontend and API (PRD 9.1 deployment). The frontend keeps the token in `sessionStorage`.
  2. **Token contents:** `sub` (user id as string) only. Role and status are read from the database on every request, so suspensions and role changes take effect immediately.
  3. **Lifetime:** 1 hour, no refresh token in the MVP. `JWT_SECRET` is required at startup.
  4. **Password hashing:** `bcryptjs`, cost factor 12.
  5. **Password policy:** minimum 8 characters, at least one letter and one number, maximum 72 bytes (bcrypt limit).
  6. **Login errors:** wrong email or password returns `401` with one generic message. Only after the password is verified do we return `403` for `PENDING`, `REJECTED` or `SUSPENDED`, so the API cannot be used to discover which emails exist.
  7. **Logout:** the client discards the token. The server endpoint returns `200` and holds no state. Known limitation: a stolen token stays valid until expiry. Documented as an MVP limit.
  8. **Rate limiting:** login and signup limited with `express-rate-limit` (`429`). `helmet` added for security headers. Request body limit for auth routes is small (10 kb).

### OPEN-003: Request Validation Strategy
- **PRD Reference:** Section 9.1 (*"Validation: use one agreed schema validation library or shared validation helpers."*)
- **Action Required:** Team to agree on either a lightweight schema library (e.g., `zod`, `joi`, `express-validator`) or shared validation helper functions in `server/src/shared/`.
- **Member 3 Alignment (PROPOSED):** Aligns with `zod` (`^4.6.7`, already installed in `server/package.json` and used in `server/src/modules/courses/course.validation.js`).

### OPEN-004: Certificate Status Representation (Proposed under `ADR-004` / `SCHEMA-M4-02`)
- **PRD Reference:** Section 10.3 (*"Certificate statuses should be represented by `issued_at` and nullable `revoked_at`, or by one explicitly standardized status field. Do not mix both models without a decision record."*)
- **Proposed Resolution:** Represented in `005_create_certificates_and_announcements.sql` using `issued_at TIMESTAMPTZ NOT NULL` and `revoked_at TIMESTAMPTZ NULL` (`NULL` = valid, non-null = revoked) without a competing `status` column. Pending formal team sign-off in `ADR-004`.

### OPEN-005: Duplicate Enrollment & Duplicate Attempt Submission Semantics
- **PRD Reference:**
  - Section 6.3: *"Duplicate enrollment is rejected or returns the existing enrollment consistently; the implementation must choose one behaviour and test it."*
  - Section 6.5: *"Submission must be idempotent or reject a second submission consistently."*
- **Action Required:** Member 2 (enrollment) and Member 3 (assessment submission) to record the chosen HTTP status (`409` vs `200`) in `docs/API_CONTRACT.md`.
- **Member 3 Proposal (PROPOSED):** Reject duplicate or late submissions on an attempt whose status is no longer `IN_PROGRESS` (`SUBMITTED`, `GRADED`, or `EXPIRED`) with `409 Conflict` (`ATTEMPT_ALREADY_SUBMITTED` or `ATTEMPT_EXPIRED`) inside the `SELECT ... FOR UPDATE` transaction.

### OPEN-006: Testing Libraries
- **PRD Reference:** Section 9.1 (*"Testing: API integration tests plus frontend critical-flow tests; exact test libraries are a team decision recorded before implementation."*)
- **Action Required:** Team to select backend test runner (e.g., Node built-in `node:test` or `vitest`/`jest` + `supertest`) and frontend test runner (e.g., `vitest` + React Testing Library).
- **Member 3 Alignment (PROPOSED):** Uses `vitest` + `supertest` on the backend (already installed and configured in `server/package.json` and `server/tests/`).

### OPEN-007: Enrollment Cancellation & Re-Enrollment Policy (`enrollments`)
- **PRD Reference:** Section 6.3 (*"Enrollment records preserve history and cannot be silently overwritten"*), Section 10.3 (`ACTIVE`, `COMPLETED`, `CANCELLED`), Section 12 (`UNIQUE (trainee_id, course_id)`).
- **Schema Context:** `003_create_courses_lessons_and_enrollments.sql` enforces 3-state mutually exclusive timestamps (`chk_enrollments_status_timestamps`) and `uq_enrollments_trainee_course UNIQUE (trainee_id, course_id)`. Because `uq_enrollments_trainee_course` spans `'CANCELLED'` rows, inserting a second row on re-enrollment raises `23505`.
- **Action Required (Member 2 & Team):** Select one policy before implementing enrollment APIs — do not invent unilaterally:
  1. **Option A (Reactivate Row in Place):** Re-enrolling when `status = 'CANCELLED'` updates `status = 'ACTIVE'`, sets `cancelled_at = NULL`, updates `updated_at = CURRENT_TIMESTAMP`, and retains prior `lesson_progress` rows.
  2. **Option B (No Self-Service Re-Enrollment in MVP):** Treat `'CANCELLED'` as terminal unless explicitly restored by an Admin.
  3. **Option C (Historical Cancelled Rows via Partial Unique Index):** Replace `uq_enrollments_trainee_course` in a team-approved migration with `CREATE UNIQUE INDEX ... ON enrollments (trainee_id, course_id) WHERE status IN ('ACTIVE', 'COMPLETED')` so cancelled rows remain immutable while permitting a new `'ACTIVE'` row.

### OPEN-008: Migration Version Ledger (`schema_migrations`) & Execution Runner Strategy
- **PRD Reference:** Section 8.3 & Section 12 (*"implemented as versioned migrations"*).
- **Audit Finding:** Executing `psql -v ON_ERROR_STOP=1 -f 001... -f 005...` works atomically on an empty database, **but lacks a version ledger**. Once `001`–`005` are applied and teammates author incremental migrations (`006_*.sql`, `007_*.sql`), raw `psql -f` cannot automatically determine which migrations have already been applied in each developer's local or staging `capsera_db` or detect drift in already-applied SQL files.
- **Proposed Resolution (Pending Team Approval):** Approve one non-domain infrastructure table `schema_migrations (version VARCHAR(120) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)` managed by a lightweight Node/`pg` runner script (`npm run db:migrate`) that acquires a PostgreSQL transaction/advisory lock, verifies SHA-256 checksums of applied migrations, and runs only unapplied `NNN_*.sql` files in lexical order. (Not added to `001`–`005` prior to team approval.)

### OPEN-009: Durable Audit Event Persistence (`audit_logs` Infrastructure Table Proposal for PRD Section 8.1)
- **PRD Reference:** Section 8.1 (*"Record audit events for admin approval, role changes, suspension, and certificate issuance."*) & Section 10.4 / Section 19 (Change control for extra entities).
- **Audit Finding:** Ephemeral application `stdout`/console logs do **not** provide durable, queryable audit persistence across restarts/deployments, and updating `users.status` (`PENDING` → `ACTIVE` → `SUSPENDED` → `ACTIVE`) or `users.role` in place overwrites previous state (`users.approved_by`/`approved_at` and `certificates.issued_at`/`revoked_at` record only the latest snapshot).
- **Status:** APPROVED by All Members (2026-11-14)
- **Approved PRD Section 19 Deviation:**
  1. **Requirement/Section Changed:** PRD Section 10.4 / Section 12 — authorize one append-only technical audit table (`audit_logs`) alongside the 18 canonical domain entities to fulfill PRD Section 8.1.
  2. **Proposed DDL (`006_create_audit_logs.sql` upon approval):** `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `actor_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL`, `event_type VARCHAR(60) NOT NULL` (`'USER_APPROVED'`, `'USER_REJECTED'`, `'USER_SUSPENDED'`, `'USER_REACTIVATED'`, `'USER_ROLE_CHANGED'`, `'CERTIFICATE_ISSUED'`, `'CERTIFICATE_REVOKED'`), `target_entity VARCHAR(60) NOT NULL`, `target_id BIGINT NOT NULL`, `details JSONB NULL` (e.g., `{ "previousRole": "TRAINEE", "newRole": "TRAINER" }`), `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, indexed on `(target_entity, target_id, created_at DESC)` and `(actor_user_id, created_at DESC)`.
  3. **Transactional Guarantee:** Every admin governance mutation and certificate issuance/revocation writes its `audit_logs` row inside the **same** `withTransaction` block as the primary domain mutation.
  4. **Approval Required:** Members 1, 2, 3, and 4 before creating `006_create_audit_logs.sql`.
