-- =============================================================================
-- CAPSERA Migration 003: Courses, Lessons, Learning Resources, Enrollments & Progress
-- Primary Module Owner: Member 2 (Courses and Learning Resources)
-- Status: Proposed under CP-02 (Pending Formal Team Approval — see ADR-004)
-- Dependencies: 001_create_users_and_profiles.sql (users)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 7. courses (Canonical Entity: Course)
-- -----------------------------------------------------------------------------
CREATE TABLE courses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trainer_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(500) NULL,
    description TEXT NULL,
    subject VARCHAR(120) NULL,
    level VARCHAR(30) NULL,
    thumbnail_url VARCHAR(2048) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    published_at TIMESTAMPTZ NULL,
    archived_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_courses_trainer
        FOREIGN KEY (trainer_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_courses_title_non_empty
        CHECK (LENGTH(BTRIM(title)) > 0),
    CONSTRAINT chk_courses_level
        CHECK (level IS NULL OR level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    CONSTRAINT chk_courses_status
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT chk_courses_published_fields
        CHECK (
            status <> 'PUBLISHED'
            OR (
                description IS NOT NULL AND LENGTH(BTRIM(description)) > 0
                AND subject IS NOT NULL AND LENGTH(BTRIM(subject)) > 0
                AND level IS NOT NULL
            )
        ),
    CONSTRAINT chk_courses_lifecycle_timestamps
        CHECK (
            (status <> 'PUBLISHED' OR (published_at IS NOT NULL AND archived_at IS NULL))
            AND (status <> 'ARCHIVED' OR archived_at IS NOT NULL)
            AND (status = 'ARCHIVED' OR archived_at IS NULL)
            AND (published_at IS NULL OR archived_at IS NULL OR archived_at >= published_at)
        )
);

CREATE INDEX idx_courses_trainer_id ON courses (trainer_id);
CREATE INDEX idx_courses_status_subject ON courses (status, subject);
CREATE INDEX idx_courses_status_level ON courses (status, level);

-- -----------------------------------------------------------------------------
-- 8. lessons (Canonical Entity: Lesson)
-- -----------------------------------------------------------------------------
CREATE TABLE lessons (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NULL,
    lesson_order INTEGER NOT NULL,
    estimated_duration_minutes INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Non-deferrable by default so PostgreSQL INSERT ... ON CONFLICT (course_id, lesson_order) works
    CONSTRAINT uq_lessons_course_order
        UNIQUE (course_id, lesson_order),
    -- Ordered (course_id, id) to support composite child FKs without duplicating lessons_pkey (id)
    CONSTRAINT uq_lessons_course_id_id
        UNIQUE (course_id, id),
    CONSTRAINT fk_lessons_course
        FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT,
    CONSTRAINT chk_lessons_title_non_empty
        CHECK (LENGTH(BTRIM(title)) > 0),
    CONSTRAINT chk_lessons_order_positive
        CHECK (lesson_order >= 1),
    CONSTRAINT chk_lessons_duration_positive
        CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0)
);

-- Note: uq_lessons_course_order and uq_lessons_course_id_id index leading column course_id.

-- -----------------------------------------------------------------------------
-- 9. learning_resources (Canonical Entity: LearningResource)
-- Stores metadata and storage/link references only (never binary payloads — PRD 6.4/8.4).
-- -----------------------------------------------------------------------------
CREATE TABLE learning_resources (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL,
    lesson_id BIGINT NULL,
    uploaded_by BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    resource_type VARCHAR(20) NOT NULL,
    storage_ref VARCHAR(2048) NULL,
    external_url VARCHAR(2048) NULL,
    original_filename VARCHAR(255) NULL,
    mime_type VARCHAR(120) NULL,
    file_size_bytes BIGINT NULL,
    resource_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_learning_resources_course
        FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT,
    CONSTRAINT fk_learning_resources_lesson_course
        FOREIGN KEY (course_id, lesson_id) REFERENCES lessons (course_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_learning_resources_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_learning_resources_title_non_empty
        CHECK (LENGTH(BTRIM(title)) > 0),
    CONSTRAINT chk_learning_resources_type
        CHECK (resource_type IN ('VIDEO', 'PRESENTATION', 'DOCUMENT', 'LINK', 'OTHER')),
    CONSTRAINT chk_learning_resources_location
        CHECK (
            (storage_ref IS NOT NULL AND LENGTH(BTRIM(storage_ref)) > 0)
            OR (external_url IS NOT NULL AND LENGTH(BTRIM(external_url)) > 0)
        ),
    CONSTRAINT chk_learning_resources_link_url
        CHECK (
            resource_type <> 'LINK'
            OR (external_url IS NOT NULL AND LENGTH(BTRIM(external_url)) > 0)
        ),
    CONSTRAINT chk_learning_resources_file_size
        CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    CONSTRAINT chk_learning_resources_order_positive
        CHECK (resource_order >= 1)
);

CREATE INDEX idx_learning_resources_course_order ON learning_resources (course_id, resource_order);
CREATE INDEX idx_learning_resources_lesson_id ON learning_resources (lesson_id);
CREATE INDEX idx_learning_resources_uploaded_by ON learning_resources (uploaded_by);

-- -----------------------------------------------------------------------------
-- 10. enrollments (Canonical Entity: Enrollment)
-- Course progress percentage is derived dynamically from lesson_progress & lessons,
-- never stored as a client-supplied percentage (PRD Section 6.6).
-- -----------------------------------------------------------------------------
CREATE TABLE enrollments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trainee_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ NULL,
    cancelled_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_enrollments_trainee_course UNIQUE (trainee_id, course_id),
    CONSTRAINT uq_enrollments_course_id_id UNIQUE (course_id, id),
    CONSTRAINT fk_enrollments_trainee
        FOREIGN KEY (trainee_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_enrollments_course
        FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT,
    CONSTRAINT chk_enrollments_status
        CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_enrollments_status_timestamps
        CHECK (
            (status = 'ACTIVE' AND completed_at IS NULL AND cancelled_at IS NULL)
            OR (status = 'COMPLETED' AND completed_at IS NOT NULL AND cancelled_at IS NULL)
            OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND completed_at IS NULL)
        ),
    CONSTRAINT chk_enrollments_chronology
        CHECK (
            (completed_at IS NULL OR completed_at >= enrolled_at)
            AND (cancelled_at IS NULL OR cancelled_at >= enrolled_at)
        )
);

-- uq_enrollments_trainee_course indexes trainee_id; uq_enrollments_course_id_id &
-- idx_enrollments_course_status index course_id & status filters
CREATE INDEX idx_enrollments_course_status ON enrollments (course_id, status);
CREATE INDEX idx_enrollments_status ON enrollments (status);

-- -----------------------------------------------------------------------------
-- 11. lesson_progress (Canonical Entity: LessonProgress)
-- Composite FKs guarantee completed lesson belongs to the exact same course_id
-- as the referenced enrollment.
-- -----------------------------------------------------------------------------
CREATE TABLE lesson_progress (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    enrollment_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    lesson_id BIGINT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_lesson_progress_enrollment_lesson UNIQUE (enrollment_id, lesson_id),
    CONSTRAINT fk_lesson_progress_enrollment_course
        FOREIGN KEY (course_id, enrollment_id)
        REFERENCES enrollments (course_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_lesson_progress_lesson_course
        FOREIGN KEY (course_id, lesson_id)
        REFERENCES lessons (course_id, id) ON DELETE RESTRICT
);

-- uq_lesson_progress_enrollment_lesson indexes enrollment_id; composite index covers
-- fk_lesson_progress_lesson_course (course_id, lesson_id) and course-scoped progress queries
CREATE INDEX idx_lesson_progress_course_lesson ON lesson_progress (course_id, lesson_id);

COMMIT;
