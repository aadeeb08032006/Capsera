import { executeQuery } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { COURSE_STATUSES, ENROLLMENT_STATUSES, ROLES } from '../../shared/constants.js';

/**
 * Execute parameterized SQL and mask internal PostgreSQL details from API callers.
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
      if (error?.constraint === 'uq_questions_assessment_order') {
        throw new AppError(
          409,
          'DUPLICATE_QUESTION_ORDER',
          'Question with this order already exists in the assessment',
        );
      }
      throw new AppError(409, 'CONFLICT', 'Resource conflicts with an existing record');
    }
    if (error?.code === '23503' || error?.code === '23514') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request violates database constraints');
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

/**
 * Verify that the actor is ADMIN or the TRAINER who owns the target course.
 * Returns the course row when authorized.
 */
export async function verifyCourseOwnership(courseId, actor, client = null) {
  if (!actor || (actor.role !== ROLES.TRAINER && actor.role !== ROLES.ADMIN)) {
    throw new AppError(403, 'FORBIDDEN', 'Only course owners or admins can manage assessments');
  }

  const result = await runSql(
    'SELECT id, trainer_id, title, status FROM courses WHERE id = $1',
    [String(courseId)],
    client,
  );

  if (!result?.rows?.length) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  const course = result.rows[0];

  if (actor.role !== ROLES.ADMIN && String(course.trainer_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only manage assessments for your own courses');
  }

  return course;
}

/**
 * Verify course visibility and trainee enrollment status.
 * Defaults to requiring a PUBLISHED course and an ACTIVE enrollment.
 */
export async function verifyCourseEnrollment(
  courseId,
  traineeId,
  {
    requirePublishedCourse = true,
    allowedStatuses = [ENROLLMENT_STATUSES.ACTIVE],
    client = null,
  } = {},
) {
  const courseRes = await runSql(
    'SELECT id, trainer_id, title, status FROM courses WHERE id = $1',
    [String(courseId)],
    client,
  );

  if (!courseRes?.rows?.length) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  const course = courseRes.rows[0];
  if (requirePublishedCourse && course.status !== COURSE_STATUSES.PUBLISHED) {
    throw new AppError(409, 'COURSE_NOT_PUBLISHED', 'Course is not published');
  }

  const enrollRes = await runSql(
    'SELECT id, course_id, trainee_id, status FROM enrollments WHERE course_id = $1 AND trainee_id = $2',
    [String(courseId), String(traineeId)],
    client,
  );

  if (!enrollRes?.rows?.length) {
    throw new AppError(403, 'NOT_ENROLLED', 'You must be enrolled in this course');
  }

  const enrollment = enrollRes.rows[0];
  if (!allowedStatuses.includes(enrollment.status)) {
    throw new AppError(
      403,
      'ENROLLMENT_INACTIVE',
      `Course enrollment is ${enrollment.status.toLowerCase()}`,
    );
  }

  return { course, enrollment };
}

/**
 * Fetch an assessment joined with its parent course ownership/status fields.
 */
export async function findAssessmentWithCourse(
  assessmentId,
  { forUpdate = false, client = null } = {},
) {
  const lockClause = forUpdate ? 'FOR UPDATE OF a' : '';
  const result = await runSql(
    `SELECT
       a.id,
       a.course_id,
       a.title,
       a.instructions,
       a.deadline_at,
       a.duration_minutes,
       a.max_attempts,
       a.pass_percentage,
       a.is_required,
       a.status,
       a.published_at,
       a.created_at,
       a.updated_at,
       c.trainer_id AS course_trainer_id,
       c.status AS course_status,
       c.title AS course_title
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     WHERE a.id = $1
     ${lockClause}`,
    [String(assessmentId)],
    client,
  );

  if (!result?.rows?.length) {
    throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');
  }

  return result.rows[0];
}

/**
 * Check whether any attempts have already been recorded for an assessment.
 * Used to lock structural scoring edits (SCHEMA-M3-01).
 */
export async function hasAssessmentAttempts(assessmentId, client = null) {
  const result = await runSql(
    'SELECT EXISTS (SELECT 1 FROM assessment_attempts WHERE assessment_id = $1) AS has_attempts',
    [String(assessmentId)],
    client,
  );
  return Boolean(result?.rows?.[0]?.has_attempts);
}
