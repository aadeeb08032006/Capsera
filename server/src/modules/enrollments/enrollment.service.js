import { executeQuery } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { COURSE_STATUSES, ENROLLMENT_STATUSES, ROLES, USER_STATUSES } from '../../shared/constants.js';

export function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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
      const appErr = new AppError(409, 'CONFLICT', 'Resource conflicts with an existing record');
      appErr.constraint = error.constraint;
      throw appErr;
    }
    if (error?.code === '23503' || error?.code === '23514') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request violates database constraints');
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

export function mapEnrollmentRow(row) {
  return {
    id: String(row.id),
    traineeId: String(row.trainee_id),
    courseId: String(row.course_id),
    status: row.status,
    enrolledAt: toIsoString(row.enrolled_at),
    completedAt: toIsoString(row.completed_at),
    cancelledAt: toIsoString(row.cancelled_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

/**
 * Enroll active trainee in a PUBLISHED course.
 */
export async function enrollInCourse(courseId, actor) {
  if (actor.role !== ROLES.TRAINEE) {
    throw new AppError(403, 'FORBIDDEN', 'Only trainees can enroll in courses');
  }
  if (actor.status !== USER_STATUSES.ACTIVE) {
    throw new AppError(403, 'FORBIDDEN', 'Only active trainees can enroll in courses');
  }

  const courseRes = await runSql(
    'SELECT id, title, status FROM courses WHERE id = $1',
    [String(courseId)],
  );

  if (!courseRes?.rows?.length) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  const course = courseRes.rows[0];
  if (course.status !== COURSE_STATUSES.PUBLISHED) {
    if (course.status === COURSE_STATUSES.ARCHIVED) {
      throw new AppError(409, 'COURSE_ARCHIVED', 'Cannot enroll in an archived course');
    }
    throw new AppError(409, 'COURSE_NOT_PUBLISHED', 'Cannot enroll in an unpublished course');
  }

  try {
    const result = await runSql(
      `INSERT INTO enrollments (trainee_id, course_id, status)
       VALUES ($1, $2, $3)
       RETURNING id, trainee_id, course_id, status, enrolled_at, completed_at, cancelled_at, updated_at`,
      [String(actor.id), String(courseId), ENROLLMENT_STATUSES.ACTIVE],
    );

    return mapEnrollmentRow(result.rows[0]);
  } catch (error) {
    if (
      error?.code === '23505' ||
      error?.code === 'CONFLICT' ||
      error?.constraint === 'uq_enrollments_trainee_course'
    ) {
      throw new AppError(
        409,
        'DUPLICATE_ENROLLMENT',
        'Trainee is already enrolled in this course',
      );
    }
    throw error;
  }
}
