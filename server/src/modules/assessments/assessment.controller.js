import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../shared/response.js';
import {
  assessmentIdParamSchema,
  courseIdParamSchema,
  createAssessmentBodySchema,
  listAssessmentsQuerySchema,
  parseWithSchema,
  updateAssessmentBodySchema,
} from './assessment.validation.js';
import * as assessmentService from './assessment.service.js';

export const createAssessmentHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const payload = parseWithSchema(createAssessmentBodySchema, req.body ?? {});
  const assessment = await assessmentService.createAssessment(courseId, payload, req.user);
  return sendSuccess(res, { assessment }, 201);
});

export const listAssessmentsHandler = asyncHandler(async (req, res) => {
  const { courseId } = parseWithSchema(courseIdParamSchema, req.params);
  const query = parseWithSchema(listAssessmentsQuerySchema, req.query ?? {});
  const result = await assessmentService.listAssessmentsByCourse(courseId, query, req.user);
  return sendPaginated(res, result);
});

export const getAssessmentHandler = asyncHandler(async (req, res) => {
  const { assessmentId } = parseWithSchema(assessmentIdParamSchema, req.params);
  const result = await assessmentService.getAssessmentById(assessmentId, req.user);
  return sendSuccess(res, result);
});

export const updateAssessmentHandler = asyncHandler(async (req, res) => {
  const { assessmentId } = parseWithSchema(assessmentIdParamSchema, req.params);
  const updates = parseWithSchema(updateAssessmentBodySchema, req.body ?? {});
  const assessment = await assessmentService.updateAssessment(assessmentId, updates, req.user);
  return sendSuccess(res, { assessment });
});

export const publishAssessmentHandler = asyncHandler(async (req, res) => {
  const { assessmentId } = parseWithSchema(assessmentIdParamSchema, req.params);
  const assessment = await assessmentService.publishAssessment(assessmentId, req.user);
  return sendSuccess(res, { assessment });
});

export const deleteAssessmentHandler = asyncHandler(async (req, res) => {
  const { assessmentId } = parseWithSchema(assessmentIdParamSchema, req.params);
  const outcome = await assessmentService.deleteAssessment(assessmentId, req.user);
  return sendSuccess(res, outcome);
});
