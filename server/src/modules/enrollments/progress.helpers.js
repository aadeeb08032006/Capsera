import { runSql } from './enrollment.service.js';

/**
 * Calculate progress percentage for an enrollment:
 * completed lessons / total lessons from the database.
 * If total lessons is 0, returns 0 (not 100).
 *
 * @param {string|number} courseId
 * @param {string|number} enrollmentId
 * @param {object|null} client - Optional transaction client
 * @returns {Promise<{ completedLessons: number, totalLessons: number, progressPercentage: number }>}
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

/**
 * Returns just the numeric progress percentage (0-100) for an enrollment.
 */
export async function getProgressPercentage(courseId, enrollmentId, client = null) {
  const { progressPercentage } = await calculateCourseProgress(courseId, enrollmentId, client);
  return progressPercentage;
}
