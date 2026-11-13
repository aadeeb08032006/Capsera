import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  createAssessmentHandler,
  deleteAssessmentHandler,
  getAssessmentHandler,
  listAssessmentsHandler,
  publishAssessmentHandler,
  updateAssessmentHandler,
} from './assessment.controller.js';

export const courseAssessmentRouter = Router({ mergeParams: true });
courseAssessmentRouter.use(authenticate);
courseAssessmentRouter.post(
  '/',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  createAssessmentHandler,
);
courseAssessmentRouter.get('/', listAssessmentsHandler);

export const assessmentRouter = Router();
assessmentRouter.use(authenticate);
assessmentRouter.get('/:assessmentId', getAssessmentHandler);
assessmentRouter.patch(
  '/:assessmentId',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  updateAssessmentHandler,
);
assessmentRouter.post(
  '/:assessmentId/publish',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  publishAssessmentHandler,
);
assessmentRouter.delete(
  '/:assessmentId',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  deleteAssessmentHandler,
);

export default assessmentRouter;
