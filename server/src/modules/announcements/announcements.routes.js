import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import {
  createAnnouncementHandler,
  listAnnouncementsHandler,
  updateAnnouncementHandler,
} from './announcements.controller.js';

const router = Router();

/**
 * Public visitors can fetch published announcements without a token.
 * If a Bearer token is provided or `scope=admin` / `status` is requested,
 * run the shared `authenticate` middleware so identity, role, and ACTIVE status
 * are verified against PostgreSQL.
 */
function authenticateForAnnouncementsList(req, res, next) {
  const requiresAuth =
    Boolean(req.headers.authorization) ||
    req.query?.scope === 'admin' ||
    req.query?.status !== undefined;

  if (!requiresAuth) {
    return next();
  }

  return authenticate(req, res, next);
}

router.get('/', authenticateForAnnouncementsList, listAnnouncementsHandler);
router.post('/', authenticate, requireRole(ROLES.ADMIN), createAnnouncementHandler);
router.patch(
  '/:announcementId',
  authenticate,
  requireRole(ROLES.ADMIN),
  updateAnnouncementHandler,
);

export default router;
