import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../shared/constants.js';
import { enrollInCourseHandler } from './enrollment.controller.js';

// Router for course-scoped enrollments: POST /api/v1/courses/:courseId/enrollments
export const courseEnrollmentRoutes = Router({ mergeParams: true });
courseEnrollmentRoutes.post('/', requireRole(ROLES.TRAINEE), enrollInCourseHandler);

// Top-level router: /api/v1/enrollments
const enrollmentRoutes = Router();
enrollmentRoutes.use(authenticate);

export default enrollmentRoutes;
