import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/response.js';
import {
  courseIdParamSchema,
  createLessonBodySchema,
  lessonIdParamSchema,
  parseWithSchema,
  reorderLessonsBodySchema,
  updateLessonBodySchema,
} from './lesson.validation.js';
import * as lessonService from './lesson.service.js';

export const listCourseLessonsHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const lessons = await lessonService.listCourseLessons(courseId, req.user);
  return sendSuccess(res, { lessons });
});

export const getLessonHandler = asyncHandler(async (req, res) => {
  const { lessonId } = parseWithSchema(lessonIdParamSchema, req.params);
  const lesson = await lessonService.getLessonById(lessonId, req.user);
  return sendSuccess(res, { lesson });
});

export const createLessonHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const payload = parseWithSchema(createLessonBodySchema, req.body ?? {});
  const lesson = await lessonService.createLesson(courseId, payload, req.user);
  return sendSuccess(res, { lesson }, 201);
});

export const updateLessonHandler = asyncHandler(async (req, res) => {
  const { lessonId } = parseWithSchema(lessonIdParamSchema, req.params);
  const updates = parseWithSchema(updateLessonBodySchema, req.body ?? {});
  const lesson = await lessonService.updateLesson(lessonId, updates, req.user);
  return sendSuccess(res, { lesson });
});

export const reorderCourseLessonsHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const { lessonIds } = parseWithSchema(reorderLessonsBodySchema, req.body ?? {});
  const lessons = await lessonService.reorderCourseLessons(courseId, lessonIds, req.user);
  return sendSuccess(res, { lessons });
});

export const deleteLessonHandler = asyncHandler(async (req, res) => {
  const { lessonId } = parseWithSchema(lessonIdParamSchema, req.params);
  const outcome = await lessonService.deleteLesson(lessonId, req.user);
  return sendSuccess(res, outcome);
});

