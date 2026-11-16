import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  getMyProfile,
  updateTraineeProfile,
  updateTrainerProfile,
} from './profile.controller.js';

const router = Router();

router.get('/me', authenticate, getMyProfile);
router.put('/me/trainee', authenticate, requireRole(ROLES.TRAINEE), updateTraineeProfile);
router.put('/me/trainer', authenticate, requireRole(ROLES.TRAINER), updateTrainerProfile);

export default router;
