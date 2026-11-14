import { executeQuery } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { COURSE_STATUSES, ENROLLMENT_STATUSES, ROLES } from '../../shared/constants.js';

export const COURSE_COLUMNS = `
  c.id,
  c.trainer_id,
  c.title,
  c.summary,
  c.description,
  c.subject,
  c.level,
  c.thumbnail_url,
  c.status,
  c.published_at,
  c.archived_at,
  c.created_at,
  c.updated_at
`;

/**
 * Convert a PostgreSQL timestamp or Date to a UTC ISO 8601 string.
 */
export function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Check whether a string value is missing or whitespace-only.
 */
export function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Escape LIKE/ILIKE wildcard characters so user search input is treated literally.
 */
export function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Execute parameterized SQL and ensure raw PostgreSQL errors never leak to callers.
 */
export async function runSql(sql, params = [], client = null) {
  try {
    if (client) {
      return await client.query(sql, params);
    }
    return await executeQuery(sql, params);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error?.code === '22P02') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid identifier or parameter format');
    }
    if (error?.code === '23505') {
      throw new AppError(409, 'CONFLICT', 'Resource conflicts with an existing record');
    }
    if (error?.code === '23503' || error?.code === '23514') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request violates database constraints');
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

/**
 * Enforce that the acting user owns the course or holds the ADMIN role.
 */
export function assertCourseOwnership(courseRow, actor) {
  if (actor.role === ROLES.ADMIN) {
    return;
  }
  if (String(courseRow.trainer_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only manage your own courses');
  }
}

/**
 * Load a course record by ID or throw 404 COURSE_NOT_FOUND.
 */
export async function findCourseRowById(
  courseId,
  { includeMetadata = false, forUpdate = false, client = null } = {},
) {
  const selectExtras = includeMetadata
    ? `,
       u.full_name AS trainer_name,
       (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count`
    : '';
  const joinClause = includeMetadata ? 'JOIN users u ON u.id = c.trainer_id' : '';
  const lockClause = forUpdate ? 'FOR UPDATE' : '';

  const result = await runSql(
    `SELECT ${COURSE_COLUMNS}${selectExtras}
     FROM courses c
     ${joinClause}
     WHERE c.id = $1
     ${lockClause}`,
    [courseId],
    client,
  );

  if (!result?.rows?.length) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }
  return result.rows[0];
}

/**
 * Look up an ACTIVE or COMPLETED enrollment for a trainee in a course.
 */
export async function findEntitledEnrollment(courseId, traineeId, client = null) {
  const result = await runSql(
    `SELECT id, status
     FROM enrollments
     WHERE trainee_id = $1
       AND course_id = $2
       AND status IN ($3, $4)
     LIMIT 1`,
    [traineeId, courseId, ENROLLMENT_STATUSES.ACTIVE, ENROLLMENT_STATUSES.COMPLETED],
    client,
  );

  return result?.rows?.[0] ?? null;
}

/**
 * Enforce read permissions for course lessons or protected learning resources.
 */
export async function assertCourseContentAccess(
  courseRow,
  actor,
  { requireEnrollmentForTrainee = false, client = null } = {},
) {
  if (actor.role === ROLES.ADMIN || String(courseRow.trainer_id) === String(actor.id)) {
    return;
  }

  if (requireEnrollmentForTrainee) {
    if (actor.role !== ROLES.TRAINEE || courseRow.status === COURSE_STATUSES.DRAFT) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource');
    }
    const enrollment = await findEntitledEnrollment(courseRow.id, actor.id, client);
    if (!enrollment) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You must be enrolled in this course to access learning resources',
      );
    }
    return;
  }

  if (courseRow.status === COURSE_STATUSES.PUBLISHED) {
    return;
  }

  if (actor.role === ROLES.TRAINEE && courseRow.status === COURSE_STATUSES.ARCHIVED) {
    const enrollment = await findEntitledEnrollment(courseRow.id, actor.id, client);
    if (enrollment) {
      return;
    }
  }

  throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view this course');
}

