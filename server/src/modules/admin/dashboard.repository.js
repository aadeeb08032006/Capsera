import { executeQuery } from '../../config/db.js';
import {
  ASSESSMENT_STATUSES,
  ATTEMPT_STATUSES,
  COURSE_STATUSES,
  ENROLLMENT_STATUSES,
  ROLES,
  USER_STATUSES,
} from '../../shared/constants.js';

/**
 * Fetch platform-wide summary counts across users, courses, enrollments,
 * assessments, attempts, certificates, and learner participation.
 *
 * Each table is aggregated in its own CTE so unrelated entities are never
 * multiplied by joins.
 */
export async function fetchDashboardSummaryCounts() {
  const result = await executeQuery(
    `WITH user_stats AS (
       SELECT
         COUNT(*)::int AS "totalUsers",
         COUNT(*) FILTER (WHERE role = $1)::int AS "traineeUsers",
         COUNT(*) FILTER (WHERE role = $2)::int AS "trainerUsers",
         COUNT(*) FILTER (WHERE role = $3)::int AS "adminUsers",
         COUNT(*) FILTER (WHERE status = $4)::int AS "pendingUsers",
         COUNT(*) FILTER (WHERE status = $5)::int AS "activeUsers",
         COUNT(*) FILTER (WHERE status = $6)::int AS "rejectedUsers",
         COUNT(*) FILTER (WHERE status = $7)::int AS "suspendedUsers"
       FROM users
     ),
     course_stats AS (
       SELECT
         COUNT(*)::int AS "totalCourses",
         COUNT(*) FILTER (WHERE status = $8)::int AS "draftCourses",
         COUNT(*) FILTER (WHERE status = $9)::int AS "publishedCourses",
         COUNT(*) FILTER (WHERE status = $10)::int AS "archivedCourses"
       FROM courses
     ),
     enrollment_stats AS (
       SELECT
         COUNT(*)::int AS "totalEnrollments",
         COUNT(*) FILTER (WHERE status = $11)::int AS "activeEnrollments",
         COUNT(*) FILTER (WHERE status = $12)::int AS "completedEnrollments",
         COUNT(*) FILTER (WHERE status = $13)::int AS "cancelledEnrollments",
         COUNT(DISTINCT trainee_id) FILTER (WHERE status IN ($11, $12))::int AS "enrolledTrainees"
       FROM enrollments
     ),
     assessment_stats AS (
       SELECT
         COUNT(*)::int AS "totalAssessments",
         COUNT(*) FILTER (WHERE status = $14)::int AS "draftAssessments",
         COUNT(*) FILTER (WHERE status = $15)::int AS "publishedAssessments",
         COUNT(*) FILTER (WHERE status = $16)::int AS "closedAssessments"
       FROM assessments
     ),
     attempt_stats AS (
       SELECT
         COUNT(*)::int AS "totalAttempts",
         COUNT(*) FILTER (WHERE status = $17)::int AS "inProgressAttempts",
         COUNT(*) FILTER (WHERE status = $18)::int AS "submittedAttempts",
         COUNT(*) FILTER (WHERE status = $19)::int AS "gradedAttempts",
         COUNT(*) FILTER (WHERE status = $20)::int AS "expiredAttempts",
         COUNT(*) FILTER (WHERE status = $19 AND is_passed = TRUE)::int AS "passedAttempts",
         COUNT(DISTINCT trainee_id) FILTER (WHERE status IN ($18, $19))::int AS "attemptingTrainees"
       FROM assessment_attempts
     ),
     certificate_stats AS (
       SELECT
         COUNT(*)::int AS "totalCertificates",
         COUNT(*) FILTER (WHERE revoked_at IS NULL)::int AS "validCertificates",
         COUNT(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS "revokedCertificates"
       FROM certificates
     )
     SELECT
       u.*,
       c.*,
       e.*,
       a.*,
       aa.*,
       cert.*
     FROM user_stats u
     CROSS JOIN course_stats c
     CROSS JOIN enrollment_stats e
     CROSS JOIN assessment_stats a
     CROSS JOIN attempt_stats aa
     CROSS JOIN certificate_stats cert`,
    [
      ROLES.TRAINEE,
      ROLES.TRAINER,
      ROLES.ADMIN,
      USER_STATUSES.PENDING,
      USER_STATUSES.ACTIVE,
      USER_STATUSES.REJECTED,
      USER_STATUSES.SUSPENDED,
      COURSE_STATUSES.DRAFT,
      COURSE_STATUSES.PUBLISHED,
      COURSE_STATUSES.ARCHIVED,
      ENROLLMENT_STATUSES.ACTIVE,
      ENROLLMENT_STATUSES.COMPLETED,
      ENROLLMENT_STATUSES.CANCELLED,
      ASSESSMENT_STATUSES.DRAFT,
      ASSESSMENT_STATUSES.PUBLISHED,
      ASSESSMENT_STATUSES.CLOSED,
      ATTEMPT_STATUSES.IN_PROGRESS,
      ATTEMPT_STATUSES.SUBMITTED,
      ATTEMPT_STATUSES.GRADED,
      ATTEMPT_STATUSES.EXPIRED,
    ],
  );

  return result.rows[0] ?? {};
}

/**
 * Fetch platform-wide assessment and attempt totals without cross-table
 * row multiplication.
 */
export async function fetchOverallAssessmentPerformance() {
  const result = await executeQuery(
    `WITH assessment_totals AS (
       SELECT COUNT(*)::int AS "totalAssessments"
       FROM assessments
     ),
     attempt_totals AS (
       SELECT
         COUNT(*)::int AS "totalAttempts",
         COUNT(*) FILTER (WHERE status = $1)::int AS "gradedAttempts",
         COUNT(*) FILTER (WHERE status = $1 AND is_passed = TRUE)::int AS "passedAttempts",
         ROUND(AVG(score_percentage) FILTER (WHERE status = $1), 2) AS "averageScorePercentage"
       FROM assessment_attempts
     )
     SELECT
       a."totalAssessments",
       aa."totalAttempts",
       aa."gradedAttempts",
       aa."passedAttempts",
       aa."averageScorePercentage"
     FROM assessment_totals a
     CROSS JOIN attempt_totals aa`,
    [ATTEMPT_STATUSES.GRADED],
  );

  return result.rows[0] ?? {};
}

/**
 * Fetch assessment performance grouped by course subject (`courses.subject`).
 * Blank or null subjects are grouped as `Unspecified`.
 * Courses, assessments, and attempts are pre-aggregated separately before
 * joining on normalized subject so parent counts are never multiplied.
 */
export async function fetchSubjectAssessmentPerformance() {
  const result = await executeQuery(
    `WITH course_by_subject AS (
       SELECT
         COALESCE(NULLIF(BTRIM(c.subject), ''), 'Unspecified') AS subject,
         COUNT(*)::int AS "courseCount"
       FROM courses c
       GROUP BY 1
     ),
     assessment_by_subject AS (
       SELECT
         COALESCE(NULLIF(BTRIM(c.subject), ''), 'Unspecified') AS subject,
         COUNT(*)::int AS "assessmentCount"
       FROM assessments a
       JOIN courses c ON c.id = a.course_id
       GROUP BY 1
     ),
     attempt_by_subject AS (
       SELECT
         COALESCE(NULLIF(BTRIM(c.subject), ''), 'Unspecified') AS subject,
         COUNT(*)::int AS "attemptCount",
         COUNT(*) FILTER (WHERE aa.status = $1)::int AS "gradedAttemptCount",
         COUNT(*) FILTER (WHERE aa.status = $1 AND aa.is_passed = TRUE)::int AS "passedAttemptCount",
         ROUND(AVG(aa.score_percentage) FILTER (WHERE aa.status = $1), 2) AS "averageScorePercentage"
       FROM assessment_attempts aa
       JOIN assessments a ON a.id = aa.assessment_id
       JOIN courses c ON c.id = a.course_id
       GROUP BY 1
     )
     SELECT
       cs.subject,
       cs."courseCount",
       COALESCE(ast."assessmentCount", 0)::int AS "assessmentCount",
       COALESCE(ats."attemptCount", 0)::int AS "attemptCount",
       COALESCE(ats."gradedAttemptCount", 0)::int AS "gradedAttemptCount",
       COALESCE(ats."passedAttemptCount", 0)::int AS "passedAttemptCount",
       ats."averageScorePercentage"
     FROM course_by_subject cs
     LEFT JOIN assessment_by_subject ast ON ast.subject = cs.subject
     LEFT JOIN attempt_by_subject ats ON ats.subject = cs.subject
     ORDER BY cs.subject ASC`,
    [ATTEMPT_STATUSES.GRADED],
  );

  return result.rows ?? [];
}

