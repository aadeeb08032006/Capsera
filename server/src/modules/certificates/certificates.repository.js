import { executeQuery } from '../../config/db.js';
import { PAGINATION_DEFAULTS } from '../../shared/constants.js';

function runQuery(client, sql, params) {
  if (client) {
    return client.query(sql, params);
  }
  return executeQuery(sql, params);
}

/**
 * Inspect enrollment status, lesson completion counts, and required published
 * assessment passes for a single `(traineeId, courseId)` pair.
 * Locks the enrollment row (`FOR UPDATE`) when called inside a transaction.
 */
export async function findCourseEligibilitySnapshot(client, traineeId, courseId) {
  const lockClause = client ? 'FOR UPDATE' : '';
  const result = await runQuery(
    client,
    `SELECT
       e.id AS "enrollmentId",
       e.status AS "enrollmentStatus",
       e.completed_at AS "completedAt",
       (
         SELECT COUNT(*)::int
         FROM lessons l
         WHERE l.course_id = $2
       ) AS "totalLessons",
       (
         SELECT COUNT(*)::int
         FROM lesson_progress lp
         WHERE lp.enrollment_id = e.id
           AND lp.course_id = $2
       ) AS "completedLessons",
       (
         SELECT COUNT(*)::int
         FROM assessments a
         WHERE a.course_id = $2
           AND a.status = 'PUBLISHED'
           AND a.is_required = TRUE
       ) AS "requiredAssessmentCount",
       (
         SELECT COUNT(*)::int
         FROM assessments a
         WHERE a.course_id = $2
           AND a.status = 'PUBLISHED'
           AND a.is_required = TRUE
           AND EXISTS (
             SELECT 1
             FROM assessment_attempts aa
             WHERE aa.assessment_id = a.id
               AND aa.trainee_id = $1
               AND aa.status = 'GRADED'
               AND aa.is_passed = TRUE
           )
       ) AS "passedRequiredAssessmentCount"
     FROM enrollments e
     WHERE e.trainee_id = $1
       AND e.course_id = $2
     ${lockClause}`,
    [traineeId, courseId],
  );

  return result?.rows?.[0] ?? null;
}

/**
 * Transition an ACTIVE enrollment to COMPLETED inside an active transaction.
 */
export async function markEnrollmentCompleted(client, enrollmentId) {
  const result = await runQuery(
    client,
    `UPDATE enrollments
     SET status = 'COMPLETED',
         completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND status = 'ACTIVE'
     RETURNING id, status, completed_at AS "completedAt"`,
    [enrollmentId],
  );

  return result?.rows?.[0] ?? null;
}

/**
 * Look up an existing certificate for `(traineeId, courseId)` joined with course metadata.
 */
export async function findCertificateByTraineeAndCourse(client, traineeId, courseId) {
  const result = await runQuery(
    client,
    `SELECT
       cert.id,
       cert.trainee_id AS "traineeId",
       cert.course_id AS "courseId",
       c.title AS "courseTitle",
       c.subject AS "courseSubject",
       cert.certificate_code AS "certificateCode",
       cert.issued_at AS "issuedAt",
       cert.revoked_at AS "revokedAt"
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     WHERE cert.trainee_id = $1
       AND cert.course_id = $2
     LIMIT 1`,
    [traineeId, courseId],
  );

  return result?.rows?.[0] ?? null;
}

/**
 * Attempt to insert a new certificate inside a transaction.
 * Uses `ON CONFLICT DO NOTHING` so duplicate `(trainee_id, course_id)` or
 * rare `certificate_code` collisions never abort the caller's transaction.
 */
export async function insertCertificate(client, { traineeId, courseId, certificateCode }) {
  const result = await runQuery(
    client,
    `WITH inserted AS (
       INSERT INTO certificates (trainee_id, course_id, certificate_code)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id, trainee_id, course_id, certificate_code, issued_at, revoked_at
     )
     SELECT
       cert.id,
       cert.trainee_id AS "traineeId",
       cert.course_id AS "courseId",
       c.title AS "courseTitle",
       c.subject AS "courseSubject",
       cert.certificate_code AS "certificateCode",
       cert.issued_at AS "issuedAt",
       cert.revoked_at AS "revokedAt"
     FROM inserted cert
     JOIN courses c ON c.id = cert.course_id`,
    [traineeId, courseId, certificateCode],
  );

  return result?.rows?.[0] ?? null;
}

/**
 * List certificates owned by a trainee with pagination (read-only).
 */
export async function findCertificatesByTraineeId({
  traineeId,
  limit = PAGINATION_DEFAULTS.PAGE_SIZE,
  offset = 0,
}) {
  const countResult = await executeQuery(
    `SELECT COUNT(*)::int AS "totalItems"
     FROM certificates
     WHERE trainee_id = $1`,
    [traineeId],
  );

  const totalItems = Number(countResult?.rows?.[0]?.totalItems ?? 0);
  if (totalItems === 0) {
    return { items: [], totalItems: 0 };
  }

  const rowsResult = await executeQuery(
    `SELECT
       cert.id,
       cert.trainee_id AS "traineeId",
       cert.course_id AS "courseId",
       c.title AS "courseTitle",
       c.subject AS "courseSubject",
       cert.certificate_code AS "certificateCode",
       cert.issued_at AS "issuedAt",
       cert.revoked_at AS "revokedAt"
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     WHERE cert.trainee_id = $1
     ORDER BY cert.issued_at DESC, cert.id DESC
     LIMIT $2
     OFFSET $3`,
    [traineeId, limit, offset],
  );

  return {
    items: rowsResult?.rows ?? [],
    totalItems,
  };
}

/**
 * Fetch minimal public verification metadata by `certificateCode`.
 * Deliberately omits email, user IDs, internal record IDs, and assessment scores.
 */
export async function findCertificateByCode(certificateCode) {
  const result = await executeQuery(
    `SELECT
       cert.certificate_code AS "certificateCode",
       u.full_name AS "traineeName",
       c.title AS "courseTitle",
       cert.issued_at AS "issuedAt",
       cert.revoked_at AS "revokedAt"
     FROM certificates cert
     JOIN users u ON u.id = cert.trainee_id
     JOIN courses c ON c.id = cert.course_id
     WHERE UPPER(cert.certificate_code) = UPPER($1)
     LIMIT 1`,
    [certificateCode],
  );

  return result?.rows?.[0] ?? null;
}

