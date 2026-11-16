import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/response.js';
import * as enrollmentService from './enrollment.service.js';
import { courseIdParamSchema, parseWithSchema } from './enrollment.validation.js';

export const enrollInCourseHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const enrollment = await enrollmentService.enrollInCourse(courseId, req.user);
  return sendSuccess(res, { enrollment }, 201);
});
