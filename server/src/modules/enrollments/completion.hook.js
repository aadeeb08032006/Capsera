import { runSql } from './enrollment.service.js';
import { calculateCourseProgress } from './progress.helpers.js';
import { ENROLLMENT_STATUSES } from '../../shared/constants.js';

/**
 * MEMBER 3 COMPLETION HOOK:
 * Evaluates whether all course completion requirements are satisfied:
 * 1. All lessons for the course are completed (totalLessons > 0 && completedLessons >= totalLessons).
 * 2. Any required, published assessments for the course (if any) have been passed by the trainee.
 *
 * Integration Note:
 * Member 3's assessment submission and grading engine has not been fully implemented in the repo yet
 * (only assessment.auth.js and assessment.validation.js are present).
 * This hook queries the database tables (`assessments` and `assessment_attempts`) directly
 * as defined in Migration 004. Once Member 3 exports a service-level completion function,
 * this hook can seamlessly delegate to it.
 *
 * @param {string|number} courseId
 * @param {string|number} enrollmentId
 * @param {string|number} traineeId
 * @param {object|null} client - Optional transaction client
 * @returns {Promise<{ isComplete: boolean, reason?: string, progress: object }>}
 */
export async function evaluateCourseCompletion(courseId, enrollmentId, traineeId, client = null) {
  // 1. Check lessons progress
  const progress = await calculateCourseProgress(courseId, enrollmentId, client);
  if (progress.totalLessons === 0 || progress.completedLessons < progress.totalLessons) {
    return { isComplete: false, reason: 'NOT_ALL_LESSONS_COMPLETED', progress };
  }

  // 2. Member 3 Hook: Check required published assessments
  const assessmentRes = await runSql(
    `SELECT id, title
     FROM assessments
     WHERE course_id = $1
       AND status = 'PUBLISHED'
       AND is_required = TRUE`,
    [String(courseId)],
    client,
  );

  const requiredAssessments = assessmentRes?.rows ?? [];
  for (const assessment of requiredAssessments) {
    const attemptRes = await runSql(
      `SELECT id
       FROM assessment_attempts
       WHERE assessment_id = $1
         AND trainee_id = $2
         AND is_passed = TRUE
       LIMIT 1`,
      [String(assessment.id), String(traineeId)],
      client,
    );

    if (!attemptRes?.rows?.length) {
      return {
        isComplete: false,
        reason: 'REQUIRED_ASSESSMENT_NOT_PASSED',
        requiredAssessmentId: String(assessment.id),
        progress,
      };
    }
  }

  return { isComplete: true, progress };
}

/**
 * Evaluate completion rules and update enrollment to COMPLETED if all criteria are met.
 */
export async function checkAndApplyCourseCompletion(courseId, enrollmentId, traineeId, client = null) {
  const evaluation = await evaluateCourseCompletion(courseId, enrollmentId, traineeId, client);

  if (evaluation.isComplete) {
    const updateRes = await runSql(
      `UPDATE enrollments
       SET status = $1,
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = $3
       RETURNING id, trainee_id, course_id, status, enrolled_at, completed_at, cancelled_at, updated_at`,
      [ENROLLMENT_STATUSES.COMPLETED, String(enrollmentId), ENROLLMENT_STATUSES.ACTIVE],
      client,
    );

    return {
      isComplete: true,
      enrollment: updateRes?.rows?.[0] ?? null,
      progress: evaluation.progress,
    };
  }

  return {
    isComplete: false,
    reason: evaluation.reason,
    progress: evaluation.progress,
  };
}
