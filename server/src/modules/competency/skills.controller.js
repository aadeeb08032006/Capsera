import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendPaginated } from '../../shared/response.js';
import { listSkillsQuerySchema, parseWithSchema } from './skills.validation.js';
import { listSkills } from './skills.service.js';

export const listSkillsHandler = asyncHandler(async (req, res) => {
  const filters = parseWithSchema(listSkillsQuerySchema, req.query ?? {});
  const result = await listSkills(filters);
  return sendPaginated(res, result);
});

