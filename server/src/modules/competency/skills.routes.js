import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { listSkillsHandler } from './skills.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', listSkillsHandler);

export default router;

