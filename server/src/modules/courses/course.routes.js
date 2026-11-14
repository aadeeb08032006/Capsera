import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  archiveCourseHandler,
  createCourseHandler,
  deleteCourseHandler,
  getCourseHandler,
  listCoursesHandler,
  publishCourseHandler,
  updateCourseHandler,
} from './course.controller.js';
import { courseLessonRoutes } from './lesson.routes.js';
import { courseResourceRoutes } from './resource.routes.js';

const router = Router();

router.use(authenticate);

router.get('/', listCoursesHandler);
router.post('/', requireRole(ROLES.TRAINER, ROLES.ADMIN), createCourseHandler);
router.get('/:courseId', getCourseHandler);
router.patch('/:courseId', requireRole(ROLES.TRAINER, ROLES.ADMIN), updateCourseHandler);
router.post('/:courseId/publish', requireRole(ROLES.TRAINER, ROLES.ADMIN), publishCourseHandler);
router.post('/:courseId/archive', requireRole(ROLES.TRAINER, ROLES.ADMIN), archiveCourseHandler);
router.delete('/:courseId', requireRole(ROLES.TRAINER, ROLES.ADMIN), deleteCourseHandler);

router.use('/:courseId/lessons', courseLessonRoutes);
router.use('/:courseId/resources', courseResourceRoutes);

export default router;

