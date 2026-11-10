# CAPSERA Database Migrations (`database/migrations/`)

This directory holds numbered, dependency-ordered PostgreSQL migration files for the `capsera_db` database (PostgreSQL 15+, per faculty requirement recorded in [docs/DECISIONS.md](../../docs/DECISIONS.md) — `ADR-002`, `ADR-003`, and `ADR-004`).

> **Governance Gate (CP-02):** Although the team agreed to begin designing the shared schema, final schema approval is **pending** review by all four team members (`ADR-004`). Do **not** apply these migrations to a shared staging/demo `capsera_db` or alter table definitions unilaterally before team sign-off.

---

## 1. Migration Inventory & Dependency Order

All 18 canonical entities from **PRD Section 10.4** are organized across five transactional migration files in strict foreign-key topological order:

| Order | Migration File | Tables Created | Primary Owner | Dependencies |
|---|---|---|---|---|
| `001` | `001_create_users_and_profiles.sql` | `users`, `trainee_profiles`, `trainer_profiles` | Member 1 | None (root tables) |
| `002` | `002_create_skills_and_competency.sql` | `skills`, `trainee_skills`, `trainer_skills` | Member 4 | `001` (`users`) |
| `003` | `003_create_courses_lessons_and_enrollments.sql` | `courses`, `lessons`, `learning_resources`, `enrollments`, `lesson_progress` | Member 2 | `001` (`users`) |
| `004` | `004_create_assessments_attempts_and_feedback.sql` | `assessments`, `questions`, `assessment_attempts`, `attempt_answers`, `feedback` | Member 3 | `001` (`users`), `003` (`courses`) |
| `005` | `005_create_certificates_and_announcements.sql` | `certificates`, `announcements` | Member 4 | `001` (`users`), `003` (`courses`) |

---

## 2. Authoring Conventions

1. **Naming Format:** `NNN_description.sql` (zero-padded 3-digit prefix).
2. **PostgreSQL Native DDL Only:**
   - Every migration file is wrapped in `BEGIN; ... COMMIT;` so PostgreSQL executes DDL atomically.
   - Primary keys use `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`.
   - Timestamps use `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` (stored in UTC).
   - Never use MySQL-specific syntax (`ENGINE=InnoDB`, `AUTO_INCREMENT`, `UNSIGNED`, `DATETIME`, or backtick identifiers).
3. **Referential Integrity & Indexing:**
   - All foreign keys are explicitly named (`fk_<table>_<target>`) and use `ON DELETE RESTRICT` (except `users.approved_by` which uses `ON DELETE SET NULL`) to preserve historical learning, attempt, and certificate records (PRD Section 8.3).
   - PostgreSQL does not auto-index foreign key columns; every foreign key column is covered by an explicit `CREATE INDEX` or as the leading column of a `UNIQUE` index.
4. **No Unapproved Extra Tables:** No domain or infrastructure tables outside the 18 canonical PRD entities (`schema_migrations`, `audit_logs`, etc.) have been added to `001`–`005`; infrastructure table proposals are tracked in [docs/DECISIONS.md](../../docs/DECISIONS.md) (`OPEN-008` and `OPEN-009`) for explicit four-member sign-off.

---

## 3. Migration Execution Strategy & Version Ledger Evaluation

### 3.1 Initial Baseline Execution (`001`–`005` on Empty `capsera_db`)
Once the team formally approves `ADR-004`, an empty `capsera_db` can be initialized in numerical order with `ON_ERROR_STOP=1` so execution halts immediately if any statement fails:

```bash
psql -h 127.0.0.1 -p 5432 -U postgres -d capsera_db -v ON_ERROR_STOP=1 \
  -f database/migrations/001_create_users_and_profiles.sql \
  -f database/migrations/002_create_skills_and_competency.sql \
  -f database/migrations/003_create_courses_lessons_and_enrollments.sql \
  -f database/migrations/004_create_assessments_attempts_and_feedback.sql \
  -f database/migrations/005_create_certificates_and_announcements.sql
```

*(If `DATABASE_URL` is configured, pass `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ...` instead.)*

### 3.2 Version Ledger Assessment (`OPEN-008` — Why a Ledger Is Needed Beyond Initial Setup)
- **What raw `psql -f` provides:** Transactional atomicity per file (`BEGIN; ... COMMIT;`) and immediate stop-on-error (`-v ON_ERROR_STOP=1`) on an empty database.
- **Limitation identified during CP-02 audit:** Raw `psql -f` stores **no applied-version ledger** in PostgreSQL. Re-running the full command against an initialized database aborts on `001` (`relation "users" already exists`), and once teammates author incremental migrations (`006_*.sql`, `007_*.sql`, including the proposed `audit_logs` table in `OPEN-009`), manual `psql -f` execution across four local environments and staging risks skipped files, duplicate replays, or undetected edits to already-applied SQL files.
- **Proposed Resolution (Pending Team Approval in `OPEN-008`):** Approve a lightweight `schema_migrations (version VARCHAR(120) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)` infrastructure table + Node/`pg` runner (`npm run db:migrate`) that records applied filenames and SHA-256 checksums inside each migration transaction. Until approved, `schema_migrations` is intentionally omitted from `001`–`005`.

---

## 4. Post-Application Verification Strategy

After applying the migrations in an approved environment, run the following verification queries against `capsera_db`:

### 4.1 Verify All 18 Canonical Tables Exist
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
-- Expected count: 18 rows matching PRD Section 10.4
```

### 4.2 Verify Primary Keys, Foreign Keys, Unique, and Check Constraints
```sql
SELECT conrelid::regclass AS table_name,
       conname AS constraint_name,
       contype AS constraint_type
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY table_name::text, contype, conname;
-- contype: 'p' = PRIMARY KEY, 'f' = FOREIGN KEY, 'u' = UNIQUE, 'c' = CHECK
```

### 4.3 Verify Foreign-Key & Lookup Indexes
```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### 4.4 Non-Destructive Constraint Smoke Test
Wrap constraint checks inside `BEGIN; ... ROLLBACK;` so test rows leave zero persisted data:
```sql
BEGIN;
-- 1. Verify case-insensitive skill uniqueness on LOWER(name)
INSERT INTO skills (name, category) VALUES ('Python', 'Programming');
-- A second insert of ('python', 'Data Science') must fail uq_skills_name_ci (23505)
-- 2. Verify composite FK protection on lesson_progress (cross-course lesson rejection)
-- and attempt_answers (cross-assessment question rejection)
ROLLBACK;
```

---

## 5. Rollback Strategy

### 5.1 Automatic Mid-Migration Rollback
Because every migration file is enclosed in `BEGIN; ... COMMIT;` and run with `-v ON_ERROR_STOP=1`, any syntax or constraint error during execution triggers an automatic PostgreSQL `ROLLBACK` of that file, leaving no half-created tables or orphaned indexes.

### 5.2 Local Development Reset (Reverse Dependency Order: `005` → `001`)
During local schema iteration **before** shared/demo data is frozen, tables can be torn down cleanly in reverse foreign-key dependency order inside a single transaction:

```sql
BEGIN;

-- Reverse of 005_create_certificates_and_announcements.sql
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS certificates;

-- Reverse of 004_create_assessments_attempts_and_feedback.sql
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS attempt_answers;
DROP TABLE IF EXISTS assessment_attempts;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS assessments;

-- Reverse of 003_create_courses_lessons_and_enrollments.sql
DROP TABLE IF EXISTS lesson_progress;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS learning_resources;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS courses;

-- Reverse of 002_create_skills_and_competency.sql
DROP TABLE IF EXISTS trainer_skills;
DROP TABLE IF EXISTS trainee_skills;
DROP TABLE IF EXISTS skills;

-- Reverse of 001_create_users_and_profiles.sql
DROP TABLE IF EXISTS trainer_profiles;
DROP TABLE IF EXISTS trainee_profiles;
DROP TABLE IF EXISTS users;

COMMIT;
```

### 5.3 Shared / Demo Environment Forward-Fix Policy
Once migrations `001`–`005` are applied to a shared team or demo database containing active learning records:
- **Never** drop production/demo tables or edit `001`–`005` retroactively.
- Roll back or evolve schema changes using a new numbered forward migration (e.g., `006_alter_...sql`) reviewed and approved by all four members per PRD Section 19.
