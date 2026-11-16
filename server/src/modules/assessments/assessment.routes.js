import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  createAssessmentHandler,
  createQuestionHandler,
  deleteAssessmentHandler,
  deleteQuestionHandler,
  getAssessmentHandler,
  getAttemptHandler,
  getCourseFeedbackHandler,
  getCourseResultsHandler,
  getQuestionHandler,
  listAssessmentsHandler,
  listMyAttemptsHandler,
  listQuestionsHandler,
  publishAssessmentHandler,
  startAttemptHandler,
  submitAttemptHandler,
  updateAssessmentHandler,
  updateQuestionHandler,
  upsertCourseFeedbackHandler,
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

// ─── Question Bank Endpoints ───
assessmentRouter.post(
  '/:assessmentId/questions',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  createQuestionHandler,
);
assessmentRouter.get('/:assessmentId/questions', listQuestionsHandler);
assessmentRouter.get('/:assessmentId/questions/:questionId', getQuestionHandler);
assessmentRouter.patch(
  '/:assessmentId/questions/:questionId',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  updateQuestionHandler,
);
assessmentRouter.delete(
  '/:assessmentId/questions/:questionId',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  deleteQuestionHandler,
);

// ─── Attempt Initiation ───
assessmentRouter.post(
  '/:assessmentId/attempts',
  requireRole(ROLES.TRAINEE),
  startAttemptHandler,
);

export const attemptRouter = Router();
attemptRouter.use(authenticate);
attemptRouter.get('/me', requireRole(ROLES.TRAINEE), listMyAttemptsHandler);
attemptRouter.get('/:attemptId', getAttemptHandler);
attemptRouter.post(
  '/:attemptId/submit',
  requireRole(ROLES.TRAINEE),
  submitAttemptHandler,
);

export const courseResultsRouter = Router({ mergeParams: true });
courseResultsRouter.use(authenticate);
courseResultsRouter.get(
  '/',
  requireRole(ROLES.TRAINER, ROLES.ADMIN),
  getCourseResultsHandler,
);

export const courseFeedbackRouter = Router({ mergeParams: true });
courseFeedbackRouter.use(authenticate);
courseFeedbackRouter.post(
  '/',
  requireRole(ROLES.TRAINEE),
  upsertCourseFeedbackHandler,
);
courseFeedbackRouter.get('/', getCourseFeedbackHandler);

export default assessmentRouter;
