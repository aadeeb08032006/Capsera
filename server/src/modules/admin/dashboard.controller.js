import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/response.js';
import { getAssessmentPerformance, getDashboardSummary } from './dashboard.service.js';

export const getDashboardSummaryHandler = asyncHandler(async (_req, res) => {
  const summary = await getDashboardSummary();
  return sendSuccess(res, summary);
});

export const getAssessmentPerformanceHandler = asyncHandler(async (_req, res) => {
  const performance = await getAssessmentPerformance();
  return sendSuccess(res, performance);
});

