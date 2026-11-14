import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import { getTrainerRecommendationsHandler } from './recommendations.controller.js';

const router = Router();

router.get(
  '/recommendations',
  authenticate,
  requireRole(ROLES.TRAINEE, ROLES.ADMIN),
  getTrainerRecommendationsHandler,
);

export default router;

