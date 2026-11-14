import { Router } from 'express';
import { getUsers, updateRole, updateStatus } from './user.controller.js';

const router = Router();

router.get('/', getUsers);
router.patch('/:userId/status', updateStatus);
router.patch('/:userId/role', updateRole);

export default router;
