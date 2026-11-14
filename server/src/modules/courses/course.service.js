import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { COURSE_STATUSES, ROLES, USER_STATUSES } from '../../shared/constants.js';
import { COURSE_LEVELS } from './course.validation.js';
import {
  COURSE_COLUMNS,
  assertCourseOwnership,
  escapeLikePattern,
  findCourseRowById,
  isBlank,
  runSql,
  toIsoString,
} from './course.helpers.js';

const VALID_LEVELS = new Set(Object.values(COURSE_LEVELS));

function mapCourseRow(row) {
  return {
    id: String(row.id),
    trainerId: String(row.trainer_id),
    ...(row.trainer_name !== undefined ? { trainerName: row.trainer_name } : {}),
    title: row.title,
    summary: row.summary ?? null,
    description: row.description ?? null,
    subject: row.subject ?? null,
    level: row.level ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    status: row.status,
    publishedAt: toIsoString(row.published_at),
    archivedAt: toIsoString(row.archived_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    ...(row.lesson_count !== undefined ? { lessonCount: Number(row.lesson_count) } : {}),
  };
}

function getMissingPublishFields(courseFields) {
  const missing = [];
  if (isBlank(courseFields.title)) {
    missing.push('title');
  }
  if (isBlank(courseFields.description)) {
    missing.push('description');
  }
  if (isBlank(courseFields.subject)) {
    missing.push('subject');
  }
  if (!VALID_LEVELS.has(courseFields.level)) {
    missing.push('level');
  }
  return missing;
}

async function resolveOwnerTrainerId(requestedTrainerId, actor) {
  if (actor.role !== ROLES.ADMIN || !requestedTrainerId) {
    return String(actor.id);
  }

  const userRes = await runSql(
    'SELECT id, role, status FROM users WHERE id = $1',
    [requestedTrainerId],
  );
  if (!userRes?.rows?.length) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Specified trainer was not found');
  }

  const target = userRes.rows[0];
  if (target.role !== ROLES.TRAINER || target.status !== USER_STATUSES.ACTIVE) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Target course owner must be an active trainer');
  }

  return String(target.id);
}

/**
 * Create a new course in DRAFT status.
 */
export async function createCourse(payload, actor) {
  if (actor.role !== ROLES.TRAINER && actor.role !== ROLES.ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'Only trainers or admins can create courses');
  }

  const ownerTrainerId = await resolveOwnerTrainerId(payload.trainerId, actor);

  const result = await runSql(
    `INSERT INTO courses (
       trainer_id,
       title,
       summary,
       description,
       subject,
       level,
       thumbnail_url,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, trainer_id, title, summary, description, subject, level, thumbnail_url, status, published_at, archived_at, created_at, updated_at`,
    [
      ownerTrainerId,
      payload.title,
      payload.summary ?? null,
      payload.description ?? null,
      payload.subject ?? null,
      payload.level ?? null,
      payload.thumbnailUrl ?? null,
      COURSE_STATUSES.DRAFT,
    ],
  );

  return mapCourseRow(result.rows[0]);
}

/**
 * List courses with role-aware visibility rules and pagination.
 */
export async function listCourses(filters, actor) {
  const { page, pageSize, status, subject, level, trainerId, mine, search } = filters;

  if (actor.role === ROLES.TRAINEE && mine === 'true') {
    return { items: [], page, pageSize, totalItems: 0 };
  }

  const conditions = [];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (actor.role === ROLES.TRAINEE) {
    conditions.push(`c.status = ${addParam(COURSE_STATUSES.PUBLISHED)}`);
  } else if (actor.role === ROLES.TRAINER) {
    if (mine === 'true') {
      conditions.push(`c.trainer_id = ${addParam(String(actor.id))}`);
    } else {
      const publishedParam = addParam(COURSE_STATUSES.PUBLISHED);
      const trainerParam = addParam(String(actor.id));
      conditions.push(`(c.status = ${publishedParam} OR c.trainer_id = ${trainerParam})`);
    }
  }

  if (status) {
    conditions.push(`c.status = ${addParam(status)}`);
  }
  if (subject) {
    conditions.push(`LOWER(c.subject) = LOWER(${addParam(subject)})`);
  }
  if (level) {
    conditions.push(`c.level = ${addParam(level)}`);
  }
  if (trainerId) {
    conditions.push(`c.trainer_id = ${addParam(trainerId)}`);
  }
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    const searchParam = addParam(pattern);
    conditions.push(
      `(c.title ILIKE ${searchParam} ESCAPE '\\' OR COALESCE(c.summary, '') ILIKE ${searchParam} ESCAPE '\\' OR COALESCE(c.subject, '') ILIKE ${searchParam} ESCAPE '\\')`,
    );
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await runSql(
    `SELECT COUNT(*)::int AS total_items FROM courses c ${whereSql}`,
    [...params],
  );
  const totalItems = Number(countResult.rows[0]?.total_items || 0);

  if (totalItems === 0) {
    return { items: [], page, pageSize, totalItems: 0 };
  }

  const limitParam = addParam(pageSize);
  const offsetParam = addParam((page - 1) * pageSize);

  const listResult = await runSql(
    `SELECT ${COURSE_COLUMNS},
            u.full_name AS trainer_name,
            (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count
     FROM courses c
     JOIN users u ON u.id = c.trainer_id
     ${whereSql}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    [...params],
  );

  return {
    items: listResult.rows.map(mapCourseRow),
    page,
    pageSize,
    totalItems,
  };
}

/**
 * Fetch course detail respecting visibility for DRAFT and ARCHIVED courses.
 */
export async function getCourseById(courseId, actor) {
  const row = await findCourseRowById(courseId, { includeMetadata: true });

  if (
    row.status !== COURSE_STATUSES.PUBLISHED &&
    actor.role !== ROLES.ADMIN &&
    String(row.trainer_id) !== String(actor.id)
  ) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view this course');
  }

  return mapCourseRow(row);
}

/**
 * Update editable metadata of a DRAFT or PUBLISHED course.
 */
export async function updateCourse(courseId, updates, actor) {
  const existing = await findCourseRowById(courseId);
  assertCourseOwnership(existing, actor);

  if (existing.status === COURSE_STATUSES.ARCHIVED) {
    throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Archived courses cannot be edited');
  }

  const merged = {
    title: updates.title !== undefined ? updates.title : existing.title,
    summary: updates.summary !== undefined ? updates.summary : existing.summary,
    description: updates.description !== undefined ? updates.description : existing.description,
    subject: updates.subject !== undefined ? updates.subject : existing.subject,
    level: updates.level !== undefined ? updates.level : existing.level,
    thumbnailUrl: updates.thumbnailUrl !== undefined ? updates.thumbnailUrl : existing.thumbnail_url,
  };

  if (existing.status === COURSE_STATUSES.PUBLISHED) {
    const missing = getMissingPublishFields(merged);
    if (missing.length > 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Published courses must keep required fields: ${missing.join(', ')}`,
      );
    }
  }

  const result = await runSql(
    `UPDATE courses
     SET title = $1,
         summary = $2,
         description = $3,
         subject = $4,
         level = $5,
         thumbnail_url = $6,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $7
     RETURNING id, trainer_id, title, summary, description, subject, level, thumbnail_url, status, published_at, archived_at, created_at, updated_at`,
    [
      merged.title,
      merged.summary ?? null,
      merged.description ?? null,
      merged.subject ?? null,
      merged.level ?? null,
      merged.thumbnailUrl ?? null,
      courseId,
    ],
  );

  return mapCourseRow(result.rows[0]);
}

/**
 * Publish a DRAFT course after verifying required fields are complete.
 */
export async function publishCourse(courseId, actor) {
  const existing = await findCourseRowById(courseId);
  assertCourseOwnership(existing, actor);

  if (existing.status === COURSE_STATUSES.ARCHIVED) {
    throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Archived courses cannot be published');
  }

  const missing = getMissingPublishFields(existing);
  if (missing.length > 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Cannot publish course without required fields: ${missing.join(', ')}`,
    );
  }

  if (existing.status === COURSE_STATUSES.PUBLISHED) {
    return mapCourseRow(existing);
  }

  const result = await runSql(
    `UPDATE courses
     SET status = $1,
         published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
         archived_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, trainer_id, title, summary, description, subject, level, thumbnail_url, status, published_at, archived_at, created_at, updated_at`,
    [COURSE_STATUSES.PUBLISHED, courseId],
  );

  return mapCourseRow(result.rows[0]);
}

/**
 * Archive a course (soft retirement preserving enrollments, attempts, and certificates).
 */
export async function archiveCourse(courseId, actor) {
  const existing = await findCourseRowById(courseId);
  assertCourseOwnership(existing, actor);

  if (existing.status === COURSE_STATUSES.ARCHIVED) {
    return mapCourseRow(existing);
  }

  const result = await runSql(
    `UPDATE courses
     SET status = $1,
         archived_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, trainer_id, title, summary, description, subject, level, thumbnail_url, status, published_at, archived_at, created_at, updated_at`,
    [COURSE_STATUSES.ARCHIVED, courseId],
  );

  return mapCourseRow(result.rows[0]);
}

/**
 * Prefer archive over delete: archive non-draft or referenced courses; delete only unused drafts.
 */
export async function deleteOrArchiveCourse(courseId, actor) {
  return withTransaction(async (client) => {
    const existing = await findCourseRowById(courseId, { forUpdate: true, client });
    assertCourseOwnership(existing, actor);

    const depRes = await runSql(
      `SELECT (
         EXISTS (SELECT 1 FROM lessons WHERE course_id = $1)
         OR EXISTS (SELECT 1 FROM learning_resources WHERE course_id = $1)
         OR EXISTS (SELECT 1 FROM enrollments WHERE course_id = $1)
         OR EXISTS (SELECT 1 FROM assessments WHERE course_id = $1)
         OR EXISTS (SELECT 1 FROM certificates WHERE course_id = $1)
       ) AS has_references`,
      [courseId],
      client,
    );

    const hasReferences = Boolean(depRes.rows[0]?.has_references);
    if (existing.status !== COURSE_STATUSES.DRAFT || hasReferences) {
      if (existing.status === COURSE_STATUSES.ARCHIVED) {
        return { action: 'ARCHIVED', course: mapCourseRow(existing) };
      }

      const archivedRes = await runSql(
        `UPDATE courses
         SET status = $1,
             archived_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, trainer_id, title, summary, description, subject, level, thumbnail_url, status, published_at, archived_at, created_at, updated_at`,
        [COURSE_STATUSES.ARCHIVED, courseId],
        client,
      );

      return { action: 'ARCHIVED', course: mapCourseRow(archivedRes.rows[0]) };
    }

    const deletedRes = await runSql(
      'DELETE FROM courses WHERE id = $1 RETURNING id',
      [courseId],
      client,
    );

    return {
      action: 'DELETED',
      deletedCourseId: String(deletedRes.rows[0].id),
    };
  });
}
