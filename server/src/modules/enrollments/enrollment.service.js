import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { COURSE_STATUSES, ENROLLMENT_STATUSES, ROLES, USER_STATUSES } from '../../shared/constants.js';
import {
  calculateCourseProgress,
  getProgressPercentage,
  mapEnrollmentRow,
  runSql,
  toIsoString,
} from './enrollment.helpers.js';
import {
  checkAndApplyCourseCompletion,
  evaluateCourseCompletion,
} from './completion.hook.js';

export {
  calculateCourseProgress,
  checkAndApplyCourseCompletion,
  evaluateCourseCompletion,
  getProgressPercentage,
  mapEnrollmentRow,
  runSql,
  toIsoString,
};

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
 * Safe to call repeatedly (idempotent). Executes lesson_progress recording,
 * course completion evaluation, enrollment status transition, and certificate +
 * audit log issuance atomically inside a single PostgreSQL transaction.
 */
export async function markLessonComplete(
  enrollmentId,
  lessonId,
  actor,
  { client = null } = {},
) {
  if (actor.role !== ROLES.TRAINEE) {
    throw new AppError(403, 'FORBIDDEN', 'Only trainees can update course progress');
  }

  const enrollRes = await runSql(
    'SELECT id, trainee_id, course_id, status FROM enrollments WHERE id = $1',
    [String(enrollmentId)],
    client,
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
    client,
  );

  if (!lessonRes?.rows?.length) {
    throw new AppError(404, 'LESSON_NOT_FOUND', 'Lesson not found');
  }

  const lesson = lessonRes.rows[0];
  if (String(lesson.course_id) !== String(enrollment.course_id)) {
    throw new AppError(400, 'LESSON_COURSE_MISMATCH', 'Lesson does not belong to this course');
  }

  const executeCompletionWork = async (txClient) => {
    await runSql(
      `INSERT INTO lesson_progress (enrollment_id, course_id, lesson_id, completed_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (enrollment_id, lesson_id) DO NOTHING`,
      [String(enrollment.id), String(enrollment.course_id), String(lesson.id)],
      txClient,
    );

    const progress = await calculateCourseProgress(
      enrollment.course_id,
      enrollment.id,
      txClient,
    );

    // Evaluate course completion hook and atomically issue certificate + audit event when eligible
    const completion = await checkAndApplyCourseCompletion(
      enrollment.course_id,
      enrollment.id,
      actor.id,
      txClient,
    );

    return {
      enrollmentId: String(enrollment.id),
      courseId: String(enrollment.course_id),
      lessonId: String(lesson.id),
      completed: true,
      progressPercentage: progress.progressPercentage,
      completedLessons: progress.completedLessons,
      totalLessons: progress.totalLessons,
      isComplete: completion.isComplete,
      status: completion.isComplete ? ENROLLMENT_STATUSES.COMPLETED : enrollment.status,
    };
  };

  if (client) {
    return await executeCompletionWork(client);
  }

  return await withTransaction(executeCompletionWork);
}
