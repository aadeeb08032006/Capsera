import { executeQuery } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';

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
 * Calculate progress percentage for an enrollment:
 * completed lessons / total lessons from the database.
 * If total lessons is 0, returns 0 (not 100).
 */
export async function calculateCourseProgress(courseId, enrollmentId, client = null) {
  const totalResult = await runSql(
    'SELECT COUNT(*)::int AS count FROM lessons WHERE course_id = $1',
    [String(courseId)],
    client,
  );
  const totalLessons = Number(totalResult?.rows?.[0]?.count ?? 0);

  if (totalLessons === 0) {
    return {
      completedLessons: 0,
      totalLessons: 0,
      progressPercentage: 0,
    };
  }

  const completedResult = await runSql(
    `SELECT COUNT(*)::int AS count
     FROM lesson_progress
     WHERE enrollment_id = $1 AND course_id = $2`,
    [String(enrollmentId), String(courseId)],
    client,
  );
  const completedLessons = Number(completedResult?.rows?.[0]?.count ?? 0);

  const progressPercentage = Math.round((completedLessons / totalLessons) * 100);

  return {
    completedLessons,
    totalLessons,
    progressPercentage: Math.min(100, Math.max(0, progressPercentage)),
  };
}

export async function getProgressPercentage(courseId, enrollmentId, client = null) {
  const { progressPercentage } = await calculateCourseProgress(courseId, enrollmentId, client);
  return progressPercentage;
}
