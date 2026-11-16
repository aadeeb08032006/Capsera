import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  getAssessmentPerformanceHandler,
  getDashboardSummaryHandler,
} from './dashboard.controller.js';

const router = Router();

router.use(authenticate, requireRole(ROLES.ADMIN));

router.get('/summary', getDashboardSummaryHandler);
router.get('/assessment-performance', getAssessmentPerformanceHandler);

export default router;

