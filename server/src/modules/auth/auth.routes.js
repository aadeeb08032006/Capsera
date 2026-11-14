import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/authenticate.js';
import { sendError } from '../../shared/response.js';
import { getCurrentUser, login, logout, signup } from './auth.controller.js';

const router = Router();

router.use(express.json({ limit: '10kb' }));

function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_req, res) {
      return sendError(
        res,
        { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Please try again later.' },
        429,
      );
    },
  });
}

router.post('/signup', createAuthRateLimiter(), signup);
router.post('/login', createAuthRateLimiter(), login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);

export default router;
