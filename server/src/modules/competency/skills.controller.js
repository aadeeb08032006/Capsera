import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../shared/response.js';
import {
  createSkillBodySchema,
  listSkillsQuerySchema,
  parseWithSchema,
} from './skills.validation.js';
import { createSkill, listSkills } from './skills.service.js';

export const listSkillsHandler = asyncHandler(async (req, res) => {
  const filters = parseWithSchema(listSkillsQuerySchema, req.query ?? {});
  const result = await listSkills(filters);
  return sendPaginated(res, result);
});

export const createSkillHandler = asyncHandler(async (req, res) => {
  const payload = parseWithSchema(createSkillBodySchema, req.body ?? {});
  const skill = await createSkill(payload);
  return sendSuccess(res, { skill }, 201);
});

