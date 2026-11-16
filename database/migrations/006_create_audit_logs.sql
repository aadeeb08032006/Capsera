-- =============================================================================
-- CAPSERA Migration 006: Audit Logs Infrastructure
-- Primary Module Owner: Member 1 (User Governance) / All Members (PRD 8.1 / OPEN-009)
-- Database: PostgreSQL 15+ (capsera_db)
-- =============================================================================

BEGIN;

CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id BIGINT NULL,
    event_type VARCHAR(60) NOT NULL,
    target_entity VARCHAR(60) NOT NULL,
    target_id BIGINT NOT NULL,
    details JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_logs_actor
        FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_audit_logs_event_type
        CHECK (event_type IN (
            'USER_APPROVED',
            'USER_REJECTED',
            'USER_SUSPENDED',
            'USER_REACTIVATED',
            'USER_ROLE_CHANGED',
            'CERTIFICATE_ISSUED',
            'CERTIFICATE_REVOKED'
        ))
);

CREATE INDEX idx_audit_logs_target ON audit_logs (target_entity, target_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_user_id, created_at DESC);

COMMIT;
