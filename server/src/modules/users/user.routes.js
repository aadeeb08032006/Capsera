import { Router } from 'express';
import { getUsers, resetPassword, updateRole, updateStatus } from './user.controller.js';

const router = Router();

router.get('/', getUsers);
router.patch('/:userId/status', updateStatus);
router.patch('/:userId/role', updateRole);
router.post('/:userId/reset-password', resetPassword);

export default router;
