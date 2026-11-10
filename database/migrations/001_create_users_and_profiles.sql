-- =============================================================================
-- CAPSERA Migration 001: Users and Professional Profiles
-- Primary Module Owner: Member 1 (Identity, Profiles, and User Governance)
-- Status: Proposed under CP-02 (Pending Formal Team Approval — see ADR-004)
-- Database: PostgreSQL 15+ (capsera_db)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. users (Canonical Entity: User)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    approved_by BIGINT NULL,
    approved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_users_approved_by
        FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_users_full_name_non_empty
        CHECK (LENGTH(BTRIM(full_name)) > 0),
    CONSTRAINT chk_users_email_trimmed
        CHECK (email = BTRIM(email) AND LENGTH(email) > 3),
    CONSTRAINT chk_users_password_hash_non_empty
        CHECK (LENGTH(BTRIM(password_hash)) > 0),
    CONSTRAINT chk_users_role
        CHECK (role IN ('TRAINEE', 'TRAINER', 'ADMIN')),
    CONSTRAINT chk_users_status
        CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'))
);

-- Single unique index enforcing both exact and case-insensitive email uniqueness
-- (e.g. Alice@Example.com vs alice@example.com); login queries must use LOWER(email) = LOWER($1)
CREATE UNIQUE INDEX uq_users_email_ci ON users (LOWER(email));

-- Support Admin user governance filters (GET /api/v1/admin/users) & dashboard counts
CREATE INDEX idx_users_role_status ON users (role, status);

-- Index self-referencing foreign key
CREATE INDEX idx_users_approved_by ON users (approved_by);

-- -----------------------------------------------------------------------------
-- 2. trainee_profiles (Canonical Entity: TraineeProfile)
-- -----------------------------------------------------------------------------
CREATE TABLE trainee_profiles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    headline VARCHAR(200) NULL,
    organization VARCHAR(200) NULL,
    biography TEXT NULL,
    qualifications TEXT NULL,
    work_experience TEXT NULL,
    interests TEXT NULL,
    external_certifications TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_trainee_profiles_user_id UNIQUE (user_id),
    CONSTRAINT fk_trainee_profiles_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
);

-- Note: uq_trainee_profiles_user_id automatically indexes user_id.

-- -----------------------------------------------------------------------------
-- 3. trainer_profiles (Canonical Entity: TrainerProfile)
-- -----------------------------------------------------------------------------
CREATE TABLE trainer_profiles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    headline VARCHAR(200) NULL,
    organization VARCHAR(200) NULL,
    biography TEXT NULL,
    qualifications TEXT NULL,
    work_experience TEXT NULL,
    subject_expertise VARCHAR(255) NULL,
    years_of_experience NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_trainer_profiles_user_id UNIQUE (user_id),
    CONSTRAINT fk_trainer_profiles_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_trainer_profiles_experience
        CHECK (years_of_experience >= 0 AND years_of_experience <= 80.0)
);

-- Note: uq_trainer_profiles_user_id automatically indexes user_id.

COMMIT;
