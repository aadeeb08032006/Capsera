import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  createLessonHandler,
  deleteLessonHandler,
  getLessonHandler,
  listCourseLessonsHandler,
  reorderCourseLessonsHandler,
  updateLessonHandler,
} from './lesson.controller.js';

export const courseLessonRoutes = Router({ mergeParams: true });

courseLessonRoutes.get('/', listCourseLessonsHandler);
courseLessonRoutes.post('/', requireRole(ROLES.TRAINER, ROLES.ADMIN), createLessonHandler);
courseLessonRoutes.put(
  '/reorder',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  reorderCourseLessonsHandler,
);

export const lessonRoutes = Router();

lessonRoutes.use(authenticate);
lessonRoutes.get('/:lessonId', getLessonHandler);
lessonRoutes.patch('/:lessonId', requireRole(ROLES.TRAINER, ROLES.ADMIN), updateLessonHandler);
lessonRoutes.delete('/:lessonId', requireRole(ROLES.TRAINER, ROLES.ADMIN), deleteLessonHandler);
