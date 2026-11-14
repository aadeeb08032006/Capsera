import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { COURSE_STATUSES } from '../../shared/constants.js';
import {
  assertCourseContentAccess,
  assertCourseOwnership,
  findCourseRowById,
  runSql,
  toIsoString,
} from './course.helpers.js';

const LESSON_COLUMNS = `
  id,
  course_id,
  title,
  content,
  lesson_order,
  estimated_duration_minutes,
  created_at,
  updated_at
`;

function mapLessonRow(row) {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    title: row.title,
    content: row.content ?? null,
    position: Number(row.lesson_order),
    estimatedDurationMinutes:
      row.estimated_duration_minutes !== null && row.estimated_duration_minutes !== undefined
        ? Number(row.estimated_duration_minutes)
        : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function findLessonRowById(lessonId, { forUpdate = false, client = null } = {}) {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const result = await runSql(
    `SELECT ${LESSON_COLUMNS}
     FROM lessons
     WHERE id = $1
     ${lockClause}`,
    [lessonId],
    client,
  );

  if (!result?.rows?.length) {
    throw new AppError(404, 'LESSON_NOT_FOUND', 'Lesson not found');
  }
  return result.rows[0];
}

/**
 * Apply a new positive integer ordering across lessons in a course.
 * Uses a two-phase positive offset shift so non-deferrable UNIQUE (course_id, lesson_order)
 * and CHECK (lesson_order >= 1) constraints remain satisfied.
 */
async function applyLessonOrdering(courseId, orderedEntries, client) {
  const currentRes = await runSql(
    `SELECT id, lesson_order
     FROM lessons
     WHERE course_id = $1
     ORDER BY lesson_order ASC, id ASC
     FOR UPDATE`,
    [courseId],
    client,
  );

  const currentMax = currentRes.rows.reduce(
    (max, row) => Math.max(max, Number(row.lesson_order)),
    0,
  );
  const offset = currentMax + orderedEntries.length + 10;

  for (let idx = 0; idx < orderedEntries.length; idx += 1) {
    const entry = orderedEntries[idx];
    await runSql(
      `UPDATE lessons
       SET lesson_order = $1
       WHERE id = $2 AND course_id = $3`,
      [offset + idx + 1, entry.id, courseId],
      client,
    );
  }

  for (const entry of orderedEntries) {
    await runSql(
      `UPDATE lessons
       SET lesson_order = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND course_id = $3`,
      [entry.position, entry.id, courseId],
      client,
    );
  }
}

/**
 * List ordered lessons belonging to a course, enforcing course visibility rules.
 */
export async function listCourseLessons(courseId, actor) {
  const course = await findCourseRowById(courseId);
  await assertCourseContentAccess(course, actor);

  const result = await runSql(
    `SELECT ${LESSON_COLUMNS}
     FROM lessons
     WHERE course_id = $1
     ORDER BY lesson_order ASC, id ASC`,
    [courseId],
  );

  return result.rows.map(mapLessonRow);
}

/**
 * Fetch a single lesson after checking parent course visibility.
 */
export async function getLessonById(lessonId, actor) {
  const lesson = await findLessonRowById(lessonId);
  const course = await findCourseRowById(lesson.course_id);
  await assertCourseContentAccess(course, actor);

  return mapLessonRow(lesson);
}

/**
 * Create a lesson inside a course (owner trainer or ADMIN), auto-assigning the next position unless specified.
 */
export async function createLesson(courseId, payload, actor) {
  return withTransaction(async (client) => {
    const course = await findCourseRowById(courseId, { forUpdate: true, client });
    assertCourseOwnership(course, actor);

    if (course.status === COURSE_STATUSES.ARCHIVED) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        'Cannot add lessons to an archived course',
      );
    }

    let nextPosition = payload.position;
    if (nextPosition === undefined) {
      const maxRes = await runSql(
        'SELECT COALESCE(MAX(lesson_order), 0)::int AS max_order FROM lessons WHERE course_id = $1',
        [courseId],
        client,
      );
      nextPosition = Number(maxRes.rows[0]?.max_order ?? 0) + 1;
    } else {
      const conflictRes = await runSql(
        'SELECT id FROM lessons WHERE course_id = $1 AND lesson_order = $2 LIMIT 1',
        [courseId, nextPosition],
        client,
      );
      if (conflictRes.rows.length > 0) {
        throw new AppError(
          409,
          'LESSON_POSITION_CONFLICT',
          `A lesson already exists at position ${nextPosition}`,
        );
      }
    }

    const insertRes = await runSql(
      `INSERT INTO lessons (
         course_id,
         title,
         content,
         lesson_order,
         estimated_duration_minutes
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${LESSON_COLUMNS}`,
      [
        courseId,
        payload.title,
        payload.content ?? null,
        nextPosition,
        payload.estimatedDurationMinutes ?? null,
      ],
      client,
    );

    return mapLessonRow(insertRes.rows[0]);
  });
}

/**
 * Update a lesson after looking up its course and verifying ownership.
 */
export async function updateLesson(lessonId, updates, actor) {
  return withTransaction(async (client) => {
    const existingLesson = await findLessonRowById(lessonId, { forUpdate: true, client });
    const course = await findCourseRowById(existingLesson.course_id, { forUpdate: true, client });
    assertCourseOwnership(course, actor);

    if (course.status === COURSE_STATUSES.ARCHIVED) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        'Cannot edit lessons in an archived course',
      );
    }

    const mergedTitle = updates.title !== undefined ? updates.title : existingLesson.title;
    const mergedContent =
      updates.content !== undefined ? updates.content : existingLesson.content;
    const mergedDuration =
      updates.estimatedDurationMinutes !== undefined
        ? updates.estimatedDurationMinutes
        : existingLesson.estimated_duration_minutes;
    const targetPosition =
      updates.position !== undefined ? updates.position : Number(existingLesson.lesson_order);

    const currentPosition = Number(existingLesson.lesson_order);
    let finalOrder = currentPosition;

    if (targetPosition !== currentPosition) {
      const courseLessonsRes = await runSql(
        `SELECT id, lesson_order
         FROM lessons
         WHERE course_id = $1
         ORDER BY lesson_order ASC, id ASC
         FOR UPDATE`,
        [course.id],
        client,
      );

      const conflict = courseLessonsRes.rows.find(
        (row) => Number(row.lesson_order) === targetPosition && String(row.id) !== String(lessonId),
      );

      if (conflict) {
        const remaining = courseLessonsRes.rows.filter(
          (row) => String(row.id) !== String(lessonId),
        );
        const insertIndex = Math.min(Math.max(targetPosition - 1, 0), remaining.length);
        remaining.splice(insertIndex, 0, existingLesson);

        const reorderedEntries = remaining.map((row, index) => ({
          id: String(row.id),
          position: index + 1,
        }));
        await applyLessonOrdering(course.id, reorderedEntries, client);
        finalOrder = insertIndex + 1;
      } else {
        finalOrder = targetPosition;
      }
    }

    const updateRes = await runSql(
      `UPDATE lessons
       SET title = $1,
           content = $2,
           lesson_order = $3,
           estimated_duration_minutes = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING ${LESSON_COLUMNS}`,
      [mergedTitle, mergedContent ?? null, finalOrder, mergedDuration ?? null, lessonId],
      client,
    );

    return mapLessonRow(updateRes.rows[0]);
  });
}

/**
 * Reorder all lessons within a course using an explicit array of lesson IDs.
 */
export async function reorderCourseLessons(courseId, lessonIds, actor) {
  return withTransaction(async (client) => {
    const course = await findCourseRowById(courseId, { forUpdate: true, client });
    assertCourseOwnership(course, actor);

    if (course.status === COURSE_STATUSES.ARCHIVED) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        'Cannot reorder lessons in an archived course',
      );
    }

    const existingRes = await runSql(
      `SELECT id
       FROM lessons
       WHERE course_id = $1
       ORDER BY lesson_order ASC, id ASC
       FOR UPDATE`,
      [courseId],
      client,
    );

    const existingIds = new Set(existingRes.rows.map((row) => String(row.id)));
    if (
      lessonIds.length !== existingIds.size ||
      lessonIds.some((id) => !existingIds.has(String(id)))
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'lessonIds must contain every lesson in this course exactly once',
      );
    }

    const orderedEntries = lessonIds.map((id, idx) => ({ id: String(id), position: idx + 1 }));
    await applyLessonOrdering(courseId, orderedEntries, client);

    const updatedRes = await runSql(
      `SELECT ${LESSON_COLUMNS}
       FROM lessons
       WHERE course_id = $1
       ORDER BY lesson_order ASC, id ASC`,
      [courseId],
      client,
    );

    return updatedRes.rows.map(mapLessonRow);
  });
}

/**
 * Delete an unused lesson after verifying ownership and child references.
 */
export async function deleteLesson(lessonId, actor) {
  return withTransaction(async (client) => {
    const existingLesson = await findLessonRowById(lessonId, { forUpdate: true, client });
    const course = await findCourseRowById(existingLesson.course_id, { forUpdate: true, client });
    assertCourseOwnership(course, actor);

    if (course.status === COURSE_STATUSES.ARCHIVED) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        'Cannot delete lessons from an archived course',
      );
    }

    const refRes = await runSql(
      `SELECT (
         EXISTS (SELECT 1 FROM learning_resources WHERE lesson_id = $1)
         OR EXISTS (SELECT 1 FROM lesson_progress WHERE lesson_id = $1)
       ) AS in_use`,
      [lessonId],
      client,
    );

    if (refRes.rows[0]?.in_use) {
      throw new AppError(
        409,
        'LESSON_IN_USE',
        'Cannot delete lesson with linked resources or trainee progress',
      );
    }

    const deletedRes = await runSql(
      'DELETE FROM lessons WHERE id = $1 RETURNING id',
      [lessonId],
      client,
    );

    return {
      action: 'DELETED',
      deletedLessonId: String(deletedRes.rows[0].id),
    };
  });
}

