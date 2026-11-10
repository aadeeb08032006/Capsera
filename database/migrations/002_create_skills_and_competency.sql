-- =============================================================================
-- CAPSERA Migration 002: Canonical Skill Catalogue and Competency Mapping
-- Primary Module Owner: Member 4 (Competency, Recommendations, Certificates, Admin)
-- Status: Proposed under CP-02 (Pending Formal Team Approval — see ADR-004)
-- Dependencies: 001_create_users_and_profiles.sql (users)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 4. skills (Canonical Entity: Skill)
-- -----------------------------------------------------------------------------
CREATE TABLE skills (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_skills_name_trimmed
        CHECK (name = BTRIM(name) AND LENGTH(name) > 0),
    CONSTRAINT chk_skills_category_non_empty
        CHECK (LENGTH(BTRIM(category)) > 0)
);

-- Enforce exact & case-insensitive unique skill names (e.g. 'Python' vs 'python').
-- Uses LOWER(name) directly (chk_skills_name_trimmed already guarantees trimmed storage)
-- so WHERE LOWER(name) = LOWER($1) uses this index cleanly in the PostgreSQL planner.
CREATE UNIQUE INDEX uq_skills_name_ci ON skills (LOWER(name));

-- Support skill catalogue category filtering (GET /api/v1/skills)
CREATE INDEX idx_skills_category ON skills (category);

-- -----------------------------------------------------------------------------
-- 5. trainee_skills (Canonical Entity: TraineeSkill)
-- -----------------------------------------------------------------------------
CREATE TABLE trainee_skills (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trainee_id BIGINT NOT NULL,
    skill_id BIGINT NOT NULL,
    proficiency SMALLINT NOT NULL,

    CONSTRAINT uq_trainee_skills_trainee_skill UNIQUE (trainee_id, skill_id),
    CONSTRAINT fk_trainee_skills_trainee
        FOREIGN KEY (trainee_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_trainee_skills_skill
        FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE RESTRICT,
    CONSTRAINT chk_trainee_skills_proficiency
        CHECK (proficiency BETWEEN 1 AND 4)
);

-- uq_trainee_skills_trainee_skill indexes leading column trainee_id; index skill_id FK explicitly
CREATE INDEX idx_trainee_skills_skill_id ON trainee_skills (skill_id);

-- -----------------------------------------------------------------------------
-- 6. trainer_skills (Canonical Entity: TrainerSkill)
-- -----------------------------------------------------------------------------
CREATE TABLE trainer_skills (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trainer_id BIGINT NOT NULL,
    skill_id BIGINT NOT NULL,
    proficiency SMALLINT NOT NULL,
    years_of_experience NUMERIC(4,1) NOT NULL DEFAULT 0.0,

    CONSTRAINT uq_trainer_skills_trainer_skill UNIQUE (trainer_id, skill_id),
    CONSTRAINT fk_trainer_skills_trainer
        FOREIGN KEY (trainer_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_trainer_skills_skill
        FOREIGN KEY (skill_id) REFERENCES skills (id) ON DELETE RESTRICT,
    CONSTRAINT chk_trainer_skills_proficiency
        CHECK (proficiency BETWEEN 1 AND 4),
    CONSTRAINT chk_trainer_skills_experience
        CHECK (years_of_experience >= 0 AND years_of_experience <= 80.0)
);

-- Composite index covers skill_id FK AND deterministic recommendation ranking (PRD Section 6.8):
-- 1. Exact skill match (skill_id) -> 2. Higher proficiency -> 3. More relevant experience
CREATE INDEX idx_trainer_skills_recommendation
    ON trainer_skills (skill_id, proficiency DESC, years_of_experience DESC);

COMMIT;
