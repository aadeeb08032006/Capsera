import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import { createSkillHandler, listSkillsHandler } from './skills.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', listSkillsHandler);
router.post('/', requireRole(ROLES.ADMIN), createSkillHandler);

export default router;

