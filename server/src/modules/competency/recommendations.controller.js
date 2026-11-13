import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/response.js';
import { parseWithSchema } from './skills.validation.js';
import { trainerRecommendationsQuerySchema } from './recommendations.validation.js';
import { getTrainerRecommendations } from './recommendations.service.js';

export const getTrainerRecommendationsHandler = asyncHandler(async (req, res) => {
  const { skillId, page, pageSize } = parseWithSchema(
    trainerRecommendationsQuerySchema,
    req.query ?? {},
  );
  const result = await getTrainerRecommendations({ skillId, page, pageSize });
  return sendSuccess(res, result);
});

