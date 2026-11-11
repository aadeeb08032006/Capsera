import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../shared/response.js';
import {
  courseIdParamSchema,
  createCourseBodySchema,
  listCoursesQuerySchema,
  parseWithSchema,
  updateCourseBodySchema,
} from './course.validation.js';
import * as courseService from './course.service.js';

export const createCourseHandler = asyncHandler(async (req, res) => {
  const payload = parseWithSchema(createCourseBodySchema, req.body ?? {});
  const course = await courseService.createCourse(payload, req.user);
  return sendSuccess(res, { course }, 201);
});

export const listCoursesHandler = asyncHandler(async (req, res) => {
  const filters = parseWithSchema(listCoursesQuerySchema, req.query ?? {});
  const result = await courseService.listCourses(filters, req.user);
  return sendPaginated(res, result);
});

export const getCourseHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const course = await courseService.getCourseById(courseId, req.user);
  return sendSuccess(res, { course });
});

export const updateCourseHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const updates = parseWithSchema(updateCourseBodySchema, req.body ?? {});
  const course = await courseService.updateCourse(courseId, updates, req.user);
  return sendSuccess(res, { course });
});

export const publishCourseHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const course = await courseService.publishCourse(courseId, req.user);
  return sendSuccess(res, { course });
});

export const archiveCourseHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const course = await courseService.archiveCourse(courseId, req.user);
  return sendSuccess(res, { course });
});

export const deleteCourseHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const outcome = await courseService.deleteOrArchiveCourse(courseId, req.user);
  return sendSuccess(res, outcome);
});

