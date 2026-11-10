-- =============================================================================
-- CAPSERA Migration 004: Assessments, Questions, Attempts, Answers & Feedback
-- Primary Module Owner: Member 3 (Assessments, Results, Progress, and Feedback)
-- Status: Proposed under CP-02 (Pending Formal Team Approval — see ADR-004)
-- Dependencies:
--   - 001_create_users_and_profiles.sql (users)
--   - 003_create_courses_lessons_and_enrollments.sql (courses)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 12. assessments (Canonical Entity: Assessment)
-- -----------------------------------------------------------------------------
CREATE TABLE assessments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    instructions TEXT NULL,
    deadline_at TIMESTAMPTZ NULL,
    duration_minutes INTEGER NULL,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    pass_percentage NUMERIC(5,2) NOT NULL DEFAULT 60.00,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    published_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_assessments_course
        FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT,
    CONSTRAINT chk_assessments_title_non_empty
        CHECK (LENGTH(BTRIM(title)) > 0),
    CONSTRAINT chk_assessments_duration_positive
        CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    CONSTRAINT chk_assessments_max_attempts
        CHECK (max_attempts >= 1),
    CONSTRAINT chk_assessments_pass_percentage
        CHECK (pass_percentage > 0 AND pass_percentage <= 100.00),
    CONSTRAINT chk_assessments_status
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED')),
    CONSTRAINT chk_assessments_published_timestamp
        CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
);

CREATE INDEX idx_assessments_course_status ON assessments (course_id, status);
CREATE INDEX idx_assessments_status_deadline ON assessments (status, deadline_at);

-- -----------------------------------------------------------------------------
-- 13. questions (Canonical Entity: Question)
-- Four-option MCQ with exactly one correct option ('A'..'D'), points, and explanation.
-- -----------------------------------------------------------------------------
CREATE TABLE questions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    assessment_id BIGINT NOT NULL,
    question_order INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option CHAR(1) NOT NULL,
    explanation TEXT NULL,
    points INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Non-deferrable by default so PostgreSQL INSERT ... ON CONFLICT (assessment_id, question_order) works
    CONSTRAINT uq_questions_assessment_order
        UNIQUE (assessment_id, question_order),
    -- Ordered (assessment_id, id) to support composite FK from attempt_answers without duplicating pkey
    CONSTRAINT uq_questions_assessment_id_id
        UNIQUE (assessment_id, id),
    CONSTRAINT fk_questions_assessment
        FOREIGN KEY (assessment_id) REFERENCES assessments (id) ON DELETE RESTRICT,
    CONSTRAINT chk_questions_order_positive
        CHECK (question_order >= 1),
    CONSTRAINT chk_questions_text_non_empty
        CHECK (LENGTH(BTRIM(question_text)) > 0),
    CONSTRAINT chk_questions_options_non_empty
        CHECK (
            LENGTH(BTRIM(option_a)) > 0
            AND LENGTH(BTRIM(option_b)) > 0
            AND LENGTH(BTRIM(option_c)) > 0
            AND LENGTH(BTRIM(option_d)) > 0
        ),
    CONSTRAINT chk_questions_correct_option
        CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    CONSTRAINT chk_questions_points_positive
        CHECK (points > 0)
);

-- Note: uq_questions_assessment_order and uq_questions_assessment_id_id index assessment_id.

-- -----------------------------------------------------------------------------
-- 14. assessment_attempts (Canonical Entity: AssessmentAttempt)
-- Scoring columns are computed exclusively on the server inside a transaction.
-- -----------------------------------------------------------------------------
CREATE TABLE assessment_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    assessment_id BIGINT NOT NULL,
    trainee_id BIGINT NOT NULL,
    attempt_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMPTZ NULL,
    graded_at TIMESTAMPTZ NULL,
    earned_points INTEGER NULL,
    total_points INTEGER NULL,
    score_percentage NUMERIC(5,2) NULL,
    is_passed BOOLEAN NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_assessment_attempts_number
        UNIQUE (assessment_id, trainee_id, attempt_number),
    CONSTRAINT uq_assessment_attempts_assessment_id_id
        UNIQUE (assessment_id, id),
    CONSTRAINT fk_assessment_attempts_assessment
        FOREIGN KEY (assessment_id) REFERENCES assessments (id) ON DELETE RESTRICT,
    CONSTRAINT fk_assessment_attempts_trainee
        FOREIGN KEY (trainee_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_assessment_attempts_number_positive
        CHECK (attempt_number >= 1),
    CONSTRAINT chk_assessment_attempts_status
        CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED')),
    CONSTRAINT chk_assessment_attempts_points
        CHECK (
            (earned_points IS NULL OR earned_points >= 0)
            AND (total_points IS NULL OR total_points > 0)
            AND (earned_points IS NULL OR total_points IS NULL OR earned_points <= total_points)
        ),
    CONSTRAINT chk_assessment_attempts_percentage
        CHECK (score_percentage IS NULL OR (score_percentage >= 0 AND score_percentage <= 100.00)),
    CONSTRAINT chk_assessment_attempts_submission_timestamps
        CHECK (
            (status IN ('SUBMITTED', 'GRADED') AND submitted_at IS NOT NULL AND submitted_at >= started_at)
            OR (status IN ('IN_PROGRESS', 'EXPIRED') AND submitted_at IS NULL)
        ),
    CONSTRAINT chk_assessment_attempts_graded_fields
        CHECK (
            (
                status = 'GRADED'
                AND graded_at IS NOT NULL
                AND graded_at >= submitted_at
                AND earned_points IS NOT NULL
                AND total_points IS NOT NULL
                AND score_percentage IS NOT NULL
                AND is_passed IS NOT NULL
            )
            OR (
                status <> 'GRADED'
                AND graded_at IS NULL
                AND earned_points IS NULL
                AND total_points IS NULL
                AND score_percentage IS NULL
                AND is_passed IS NULL
            )
        )
);

-- Prevent concurrent active (IN_PROGRESS) attempts by the same trainee on the same assessment.
-- Backend must expire timed-out IN_PROGRESS attempts before inserting a permitted retry.
CREATE UNIQUE INDEX uq_assessment_attempts_one_in_progress
    ON assessment_attempts (assessment_id, trainee_id)
    WHERE status = 'IN_PROGRESS';

-- Support trainee attempt history (GET /api/v1/attempts/me) & FK lookup on trainee_id
CREATE INDEX idx_assessment_attempts_trainee_history
    ON assessment_attempts (trainee_id, started_at DESC);

-- Support course/admin dashboard assessment performance aggregations without duplicating
-- the (assessment_id, trainee_id) prefix already covered by uq_assessment_attempts_number
CREATE INDEX idx_assessment_attempts_assessment_status_pass
    ON assessment_attempts (assessment_id, status, is_passed);

-- -----------------------------------------------------------------------------
-- 15. attempt_answers (Canonical Entity: AttemptAnswer)
-- Composite FKs guarantee that question_id belongs to the exact same assessment_id
-- as the parent attempt_id.
-- -----------------------------------------------------------------------------
CREATE TABLE attempt_answers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id BIGINT NOT NULL,
    assessment_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    selected_option CHAR(1) NULL,
    is_correct BOOLEAN NOT NULL,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_attempt_answers_attempt_question
        UNIQUE (attempt_id, question_id),
    CONSTRAINT fk_attempt_answers_attempt_assessment
        FOREIGN KEY (assessment_id, attempt_id)
        REFERENCES assessment_attempts (assessment_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_attempt_answers_question_assessment
        FOREIGN KEY (assessment_id, question_id)
        REFERENCES questions (assessment_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_attempt_answers_selected_option
        CHECK (selected_option IS NULL OR selected_option IN ('A', 'B', 'C', 'D')),
    CONSTRAINT chk_attempt_answers_points_awarded
        CHECK (points_awarded >= 0 AND (is_correct = TRUE OR points_awarded = 0))
);

-- uq_attempt_answers_attempt_question indexes attempt_id; composite index covers
-- fk_attempt_answers_question_assessment (assessment_id, question_id) and per-question analytics
CREATE INDEX idx_attempt_answers_assessment_question
    ON attempt_answers (assessment_id, question_id);

-- -----------------------------------------------------------------------------
-- 16. feedback (Canonical Entity: Feedback)
-- One current feedback record per trainee and course (supports upsert/edit — PRD 6.9).
-- -----------------------------------------------------------------------------
CREATE TABLE feedback (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trainee_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    rating SMALLINT NOT NULL,
    comment VARCHAR(2000) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_feedback_trainee_course UNIQUE (trainee_id, course_id),
    CONSTRAINT fk_feedback_trainee
        FOREIGN KEY (trainee_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_feedback_course
        FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT,
    CONSTRAINT chk_feedback_rating
        CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_feedback_comment_non_blank
        CHECK (comment IS NULL OR LENGTH(BTRIM(comment)) > 0)
);

-- uq_feedback_trainee_course indexes trainee_id; index course_id explicitly
CREATE INDEX idx_feedback_course_id ON feedback (course_id, created_at DESC);

COMMIT;
