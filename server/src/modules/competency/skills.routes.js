import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  createSkillHandler,
  getMyTraineeSkillsHandler,
  getMyTrainerSkillsHandler,
  listSkillsHandler,
  replaceMyTraineeSkillsHandler,
  replaceMyTrainerSkillsHandler,
} from './skills.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', listSkillsHandler);
router.post('/', requireRole(ROLES.ADMIN), createSkillHandler);

export const profileSkillsRoutes = Router();
profileSkillsRoutes.get(
  '/me/skills',
  authenticate,
  requireRole(ROLES.TRAINEE),
  getMyTraineeSkillsHandler,
);
profileSkillsRoutes.put(
  '/me/skills',
  authenticate,
  requireRole(ROLES.TRAINEE),
  replaceMyTraineeSkillsHandler,
);
profileSkillsRoutes.get(
  '/me/trainer-skills',
  authenticate,
  requireRole(ROLES.TRAINER),
  getMyTrainerSkillsHandler,
);
profileSkillsRoutes.put(
  '/me/trainer-skills',
  authenticate,
  requireRole(ROLES.TRAINER),
  replaceMyTrainerSkillsHandler,
);

export default router;

