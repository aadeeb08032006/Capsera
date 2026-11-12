import fs from 'node:fs';
import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { COURSE_STATUSES, RESOURCE_TYPES } from '../../shared/constants.js';
import {
  assertCourseContentAccess,
  assertCourseOwnership,
  findCourseRowById,
  runSql,
  toIsoString,
} from './course.helpers.js';
import {
  extractUploadedFileMetadata,
  removeStoredFile,
  resolveSafeStoragePath,
  sanitizeOriginalFilename,
} from './resource.upload.js';

const RESOURCE_COLUMNS = `
  lr.id,
  lr.course_id,
  lr.lesson_id,
  lr.uploaded_by,
  lr.title,
  lr.description,
  lr.resource_type,
  lr.storage_ref,
  lr.external_url,
  lr.original_filename,
  lr.mime_type,
  lr.file_size_bytes,
  lr.resource_order,
  lr.created_at,
  lr.updated_at
`;

/**
 * Serialize a learning_resources DB row into a public DTO without exposing raw storage_ref paths.
 */
function mapResourceRow(row) {
  const hasFile = Boolean(row.storage_ref);
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    lessonId: row.lesson_id !== null && row.lesson_id !== undefined ? String(row.lesson_id) : null,
    uploadedBy: String(row.uploaded_by),
    title: row.title,
    description: row.description ?? null,
    resourceType: row.resource_type,
    externalUrl: row.external_url ?? null,
    originalFilename: row.original_filename ?? null,
    mimeType: row.mime_type ?? null,
    fileSizeBytes:
      row.file_size_bytes !== null && row.file_size_bytes !== undefined
        ? Number(row.file_size_bytes)
        : null,
    position: Number(row.resource_order),
    hasFile,
    downloadUrl: hasFile ? `/api/v1/courses/${row.course_id}/resources/${row.id}/download` : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

/**
 * Verify the caller owns the course (or is ADMIN) and the course is mutable before storing uploads.
 */
export async function assertCanWriteCourseResources(courseId, actor) {
  const course = await findCourseRowById(courseId);
  assertCourseOwnership(course, actor);

  if (course.status === COURSE_STATUSES.ARCHIVED) {
    throw new AppError(
      409,
      'INVALID_STATUS_TRANSITION',
      'Cannot modify resources on an archived course',
    );
  }
  return course;
}

/**
 * Persist resource metadata (either uploaded file metadata or external link) inside a transaction.
 * Cleans up any uploaded file on failure so orphaned binaries do not accumulate.
 */
export async function createCourseResource(courseId, payload, uploadedFile, actor) {
  try {
    return await withTransaction(async (client) => {
      const course = await findCourseRowById(courseId, { forUpdate: true, client });
      assertCourseOwnership(course, actor);

      if (course.status === COURSE_STATUSES.ARCHIVED) {
        throw new AppError(
          409,
          'INVALID_STATUS_TRANSITION',
          'Cannot add resources to an archived course',
        );
      }

      const hasExternalUrl = Boolean(payload.externalUrl);
      if (uploadedFile && hasExternalUrl) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Provide either an uploaded file or an externalUrl, not both',
        );
      }
      if (!uploadedFile && !hasExternalUrl) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Either an uploaded file or externalUrl is required',
        );
      }
      if (uploadedFile && payload.resourceType === RESOURCE_TYPES.LINK) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'File uploads cannot use resourceType LINK',
        );
      }

      if (payload.lessonId) {
        const lessonRes = await runSql(
          'SELECT id FROM lessons WHERE id = $1 AND course_id = $2 LIMIT 1',
          [payload.lessonId, courseId],
          client,
        );
        if (!lessonRes?.rows?.length) {
          throw new AppError(404, 'LESSON_NOT_FOUND', 'Lesson not found in this course');
        }
      }

      let resourceOrder = payload.position;
      if (resourceOrder === undefined) {
        const maxRes = await runSql(
          'SELECT COALESCE(MAX(resource_order), 0)::int AS max_order FROM learning_resources WHERE course_id = $1',
          [courseId],
          client,
        );
        resourceOrder = Number(maxRes.rows[0]?.max_order ?? 0) + 1;
      }

      let resourceType = payload.resourceType;
      let storageRef = null;
      let externalUrl = null;
      let originalFilename = null;
      let mimeType = null;
      let fileSizeBytes = null;

      if (uploadedFile) {
        const meta = extractUploadedFileMetadata(courseId, uploadedFile);
        storageRef = meta.storageKey;
        originalFilename = meta.originalFilename;
        mimeType = meta.mimeType;
        fileSizeBytes = meta.fileSizeBytes;
        resourceType = resourceType || meta.defaultResourceType;
      } else {
        externalUrl = payload.externalUrl;
        resourceType = resourceType || RESOURCE_TYPES.LINK;
      }

      const insertRes = await runSql(
        `INSERT INTO learning_resources (
           course_id,
           lesson_id,
           uploaded_by,
           title,
           description,
           resource_type,
           storage_ref,
           external_url,
           original_filename,
           mime_type,
           file_size_bytes,
           resource_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, course_id, lesson_id, uploaded_by, title, description, resource_type, storage_ref, external_url, original_filename, mime_type, file_size_bytes, resource_order, created_at, updated_at`,
        [
          courseId,
          payload.lessonId ?? null,
          String(actor.id),
          payload.title,
          payload.description ?? null,
          resourceType,
          storageRef,
          externalUrl,
          originalFilename,
          mimeType,
          fileSizeBytes,
          resourceOrder,
        ],
        client,
      );

      return mapResourceRow(insertRes.rows[0]);
    });
  } catch (error) {
    if (uploadedFile) {
      await removeStoredFile({ file: uploadedFile });
    }
    throw error;
  }
}

/**
 * List course learning resources for the owner trainer, ADMIN, or an enrolled trainee.
 * Never returns raw storage paths.
 */
export async function listCourseResources(courseId, filters, actor) {
  const course = await findCourseRowById(courseId);
  await assertCourseContentAccess(course, actor, { requireEnrollmentForTrainee: true });

  const conditions = ['lr.course_id = $1'];
  const params = [courseId];

  if (filters.lessonId) {
    params.push(filters.lessonId);
    conditions.push(`lr.lesson_id = $${params.length}`);
  }
  if (filters.resourceType) {
    params.push(filters.resourceType);
    conditions.push(`lr.resource_type = $${params.length}`);
  }

  const result = await runSql(
    `SELECT ${RESOURCE_COLUMNS}
     FROM learning_resources lr
     WHERE ${conditions.join(' AND ')}
     ORDER BY lr.resource_order ASC, lr.id ASC`,
    params,
  );

  return result.rows.map(mapResourceRow);
}

/**
 * Authorize download access and resolve the local file path safely without exposing storage internals.
 */
export async function getAuthorizedResourceDownload(courseId, resourceId, actor) {
  const course = await findCourseRowById(courseId);
  await assertCourseContentAccess(course, actor, { requireEnrollmentForTrainee: true });

  const result = await runSql(
    `SELECT ${RESOURCE_COLUMNS}
     FROM learning_resources lr
     WHERE lr.id = $1 AND lr.course_id = $2`,
    [resourceId, courseId],
  );

  if (!result?.rows?.length) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Learning resource not found');
  }

  const resource = result.rows[0];
  if (!resource.storage_ref) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'External link resources cannot be downloaded as files',
    );
  }

  const filePath = resolveSafeStoragePath(resource.storage_ref);
  if (!filePath) {
    throw new AppError(404, 'RESOURCE_FILE_NOT_FOUND', 'Resource file could not be found');
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      throw new AppError(404, 'RESOURCE_FILE_NOT_FOUND', 'Resource file could not be found');
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(404, 'RESOURCE_FILE_NOT_FOUND', 'Resource file could not be found');
  }

  return {
    filePath,
    mimeType: resource.mime_type || 'application/octet-stream',
    downloadName: sanitizeOriginalFilename(resource.original_filename || 'resource'),
  };
}

/**
 * Delete a learning resource and remove any stored local upload file.
 */
export async function deleteCourseResource(courseId, resourceId, actor) {
  const deletedRow = await withTransaction(async (client) => {
    const course = await findCourseRowById(courseId, { forUpdate: true, client });
    assertCourseOwnership(course, actor);

    if (course.status === COURSE_STATUSES.ARCHIVED) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        'Cannot remove resources from an archived course',
      );
    }

    const res = await runSql(
      `DELETE FROM learning_resources
       WHERE id = $1 AND course_id = $2
       RETURNING id, storage_ref`,
      [resourceId, courseId],
      client,
    );

    if (!res?.rows?.length) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Learning resource not found');
    }
    return res.rows[0];
  });

  if (deletedRow.storage_ref) {
    await removeStoredFile({ storageRef: deletedRow.storage_ref });
  }

  return {
    action: 'DELETED',
    deletedResourceId: String(deletedRow.id),
  };
}

