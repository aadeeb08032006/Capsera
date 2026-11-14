import { Router } from 'express';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  authorizeResourceWriteHandler,
  createCourseResourceHandler,
  deleteCourseResourceHandler,
  downloadCourseResourceHandler,
  listCourseResourcesHandler,
} from './resource.controller.js';
import { handleResourceUpload } from './resource.upload.js';

export const courseResourceRoutes = Router({ mergeParams: true });

courseResourceRoutes.get('/', listCourseResourcesHandler);
courseResourceRoutes.post(
  '/',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  authorizeResourceWriteHandler,
  handleResourceUpload,
  createCourseResourceHandler,
);
courseResourceRoutes.get('/:resourceId/download', downloadCourseResourceHandler);
courseResourceRoutes.delete(
  '/:resourceId',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  deleteCourseResourceHandler,
);
