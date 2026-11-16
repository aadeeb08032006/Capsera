import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  listMyCertificatesHandler,
  verifyCertificateHandler,
} from './certificates.controller.js';

const router = Router();

router.get('/me', authenticate, requireRole(ROLES.TRAINEE), listMyCertificatesHandler);
router.get('/verify/:certificateCode', verifyCertificateHandler);

export default router;

