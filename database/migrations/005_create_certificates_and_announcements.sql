-- =============================================================================
-- CAPSERA Migration 005: Completion Certificates and Homepage Announcements
-- Primary Module Owner: Member 4 (Competency, Recommendations, Certificates, Admin)
-- Status: Proposed under CP-02 (Pending Formal Team Approval — see ADR-004)
-- Dependencies:
--   - 001_create_users_and_profiles.sql (users)
--   - 003_create_courses_lessons_and_enrollments.sql (courses)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 17. certificates (Canonical Entity: Certificate)
-- Eligibility (100% lessons completed with >= 1 lesson + required published assessments
-- passed) is enforced transactionally by backend business logic before INSERT (PRD 6.6/6.7).
-- -----------------------------------------------------------------------------
CREATE TABLE certificates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trainee_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    certificate_code VARCHAR(64) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ NULL,

    CONSTRAINT uq_certificates_code UNIQUE (certificate_code),
    CONSTRAINT uq_certificates_trainee_course UNIQUE (trainee_id, course_id),
    CONSTRAINT fk_certificates_trainee
        FOREIGN KEY (trainee_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_certificates_course
        FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT,
    CONSTRAINT chk_certificates_code_non_empty
        CHECK (certificate_code = BTRIM(certificate_code) AND LENGTH(certificate_code) > 0),
    CONSTRAINT chk_certificates_revoked_after_issued
        CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

-- uq_certificates_trainee_course indexes trainee_id; uq_certificates_code indexes certificate_code;
-- index course_id FK explicitly
CREATE INDEX idx_certificates_course_id ON certificates (course_id);

-- -----------------------------------------------------------------------------
-- 18. announcements (Canonical Entity: Announcement)
-- Public homepage feed shows only PUBLISHED, non-expired announcements (PRD 6.10).
-- -----------------------------------------------------------------------------
CREATE TABLE announcements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creator_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    published_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_announcements_creator
        FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_announcements_title_non_empty
        CHECK (LENGTH(BTRIM(title)) > 0),
    CONSTRAINT chk_announcements_body_non_empty
        CHECK (LENGTH(BTRIM(body)) > 0),
    CONSTRAINT chk_announcements_category
        CHECK (category IN ('ANNOUNCEMENT', 'ACHIEVEMENT', 'NEW_CONTENT')),
    CONSTRAINT chk_announcements_status
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT chk_announcements_published_timestamp
        CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
    CONSTRAINT chk_announcements_expiry_order
        CHECK (expires_at IS NULL OR published_at IS NULL OR expires_at > published_at)
);

CREATE INDEX idx_announcements_creator_id ON announcements (creator_id);
CREATE INDEX idx_announcements_public_feed
    ON announcements (status, published_at DESC, expires_at);

COMMIT;

