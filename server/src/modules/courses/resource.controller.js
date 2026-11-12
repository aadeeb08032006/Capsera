import { AppError } from '../../shared/AppError.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/response.js';
import {
  courseIdParamSchema,
  courseResourceParamsSchema,
  createResourceBodySchema,
  listResourcesQuerySchema,
  parseWithSchema,
} from './resource.validation.js';
import { removeStoredFile } from './resource.upload.js';
import * as resourceService from './resource.service.js';

/**
 * Guard write routes before Multer writes anything to disk.
 */
export const authorizeResourceWriteHandler = asyncHandler(async (req, res, next) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  await resourceService.assertCanWriteCourseResources(courseId, req.user);
  return next();
});

export const createCourseResourceHandler = asyncHandler(async (req, res) => {
  try {
    const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
    const payload = parseWithSchema(createResourceBodySchema, req.body ?? {});
    const resource = await resourceService.createCourseResource(
      courseId,
      payload,
      req.file ?? null,
      req.user,
    );
    return sendSuccess(res, { resource }, 201);
  } catch (error) {
    if (req.file) {
      await removeStoredFile({ file: req.file });
    }
    throw error;
  }
});

export const listCourseResourcesHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const filters = parseWithSchema(listResourcesQuerySchema, req.query ?? {});
  const resources = await resourceService.listCourseResources(courseId, filters, req.user);
  return sendSuccess(res, { resources });
});

export const downloadCourseResourceHandler = asyncHandler(async (req, res, next) => {
  const { courseId, resourceId } = parseWithSchema(courseResourceParamsSchema, req.params);
  const { filePath, mimeType, downloadName } = await resourceService.getAuthorizedResourceDownload(
    courseId,
    resourceId,
    req.user,
  );

  const asciiFallback = downloadName.replace(/[^a-zA-Z0-9._ -]/g, '_');
  const encodedFilename = encodeURIComponent(downloadName);

  res.setHeader('Content-Type', mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  return res.sendFile(filePath, { dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) {
      return next(new AppError(404, 'RESOURCE_FILE_NOT_FOUND', 'Resource file could not be found'));
    }
    return undefined;
  });
});

export const deleteCourseResourceHandler = asyncHandler(async (req, res) => {
  const { courseId, resourceId } = parseWithSchema(courseResourceParamsSchema, req.params);
  const outcome = await resourceService.deleteCourseResource(courseId, resourceId, req.user);
  return sendSuccess(res, outcome);
});

