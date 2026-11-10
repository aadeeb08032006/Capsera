# CAPSERA Database Seeds

This directory holds synthetic seed scripts and PostgreSQL seed data for local development and demo readiness.

## Conventions (per PRD v1.0 & `docs/DECISIONS.md`)

1. **Admin Provisioning (PRD Section 6.1):** Public signup never accepts `ADMIN` as a requested role. Initial `ADMIN` account(s) must be provisioned explicitly through a seed script or deployment command.
2. **PostgreSQL Idempotency:** Seed SQL/scripts should be idempotent using PostgreSQL `ON CONFLICT (...) DO NOTHING` or `ON CONFLICT (...) DO UPDATE` rather than MySQL `ON DUPLICATE KEY UPDATE` or `INSERT IGNORE`.
3. **Synthetic Data Only (PRD Section 8.2):** Never commit real personal information or plaintext credentials. Any seeded user accounts must store pre-hashed passwords (using the agreed password hashing library).
4. **Approval Gate:** Seed scripts will be added once the core schema migrations in `database/migrations/` are finalized.
