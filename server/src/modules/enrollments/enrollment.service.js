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

/**
 * Retrieve all enrollments for the logged-in trainee, each with dynamic progress percentage.
 */
export async function getMyEnrollments(actor) {
  if (actor.role !== ROLES.TRAINEE) {
    throw new AppError(403, 'FORBIDDEN', 'Only trainees can view their enrollments');
  }

  const result = await runSql(
    `SELECT e.id,
            e.trainee_id,
            e.course_id,
            e.status,
            e.enrolled_at,
            e.completed_at,
            e.cancelled_at,
            e.updated_at,
            c.title AS course_title,
            c.summary AS course_summary,
            c.subject AS course_subject,
            c.level AS course_level,
            c.thumbnail_url AS course_thumbnail_url,
            c.status AS course_status
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.trainee_id = $1
     ORDER BY e.enrolled_at DESC, e.id DESC`,
    [String(actor.id)],
  );

  const enrollments = [];
  for (const row of result.rows) {
    const progress = await calculateCourseProgress(row.course_id, row.id);
    enrollments.push({
      ...mapEnrollmentRow(row),
      courseTitle: row.course_title,
      progressPercentage: progress.progressPercentage,
      completedLessons: progress.completedLessons,
      totalLessons: progress.totalLessons,
      course: {
        id: String(row.course_id),
        title: row.course_title,
        summary: row.course_summary ?? null,
        subject: row.course_subject ?? null,
        level: row.course_level ?? null,
        thumbnailUrl: row.course_thumbnail_url ?? null,
        status: row.course_status,
      },
    });
  }

  return enrollments;
}

/**
 * Mark a lesson as completed for an enrollment.
 * Safe to call repeatedly (idempotent).
 */
export async function markLessonComplete(enrollmentId, lessonId, actor) {
  if (actor.role !== ROLES.TRAINEE) {
    throw new AppError(403, 'FORBIDDEN', 'Only trainees can update course progress');
  }

  const enrollRes = await runSql(
    'SELECT id, trainee_id, course_id, status FROM enrollments WHERE id = $1',
    [String(enrollmentId)],
  );

  if (!enrollRes?.rows?.length) {
    throw new AppError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment not found');
  }

  const enrollment = enrollRes.rows[0];
  if (String(enrollment.trainee_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only update progress for your own enrollments');
  }

  if (enrollment.status === ENROLLMENT_STATUSES.CANCELLED) {
    throw new AppError(409, 'ENROLLMENT_INACTIVE', 'Cannot update progress on a cancelled enrollment');
  }

  const lessonRes = await runSql(
    'SELECT id, course_id FROM lessons WHERE id = $1',
    [String(lessonId)],
  );

  if (!lessonRes?.rows?.length) {
    throw new AppError(404, 'LESSON_NOT_FOUND', 'Lesson not found');
  }

  const lesson = lessonRes.rows[0];
  if (String(lesson.course_id) !== String(enrollment.course_id)) {
    throw new AppError(400, 'LESSON_COURSE_MISMATCH', 'Lesson does not belong to this course');
  }

  await runSql(
    `INSERT INTO lesson_progress (enrollment_id, course_id, lesson_id, completed_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (enrollment_id, lesson_id) DO NOTHING`,
    [String(enrollment.id), String(enrollment.course_id), String(lesson.id)],
  );

  const progress = await calculateCourseProgress(enrollment.course_id, enrollment.id);

  return {
    enrollmentId: String(enrollment.id),
    courseId: String(enrollment.course_id),
    lessonId: String(lesson.id),
    completed: true,
    progressPercentage: progress.progressPercentage,
    completedLessons: progress.completedLessons,
    totalLessons: progress.totalLessons,
  };
}

export { calculateCourseProgress, getProgressPercentage } from './progress.helpers.js';
