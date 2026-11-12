import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../shared/response.js';
import {
  createSkillBodySchema,
  listSkillsQuerySchema,
  parseWithSchema,
  replaceTraineeSkillsBodySchema,
  replaceTrainerSkillsBodySchema,
} from './skills.validation.js';
import {
  createSkill,
  getMyTraineeSkills,
  getMyTrainerSkills,
  listSkills,
  replaceMyTraineeSkills,
  replaceMyTrainerSkills,
} from './skills.service.js';

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

export const replaceMyTraineeSkillsHandler = asyncHandler(async (req, res) => {
  const { skills } = parseWithSchema(replaceTraineeSkillsBodySchema, req.body ?? {});
  const savedSkills = await replaceMyTraineeSkills(req.user.id, skills);
  return sendSuccess(res, { skills: savedSkills });
});

export const replaceMyTrainerSkillsHandler = asyncHandler(async (req, res) => {
  const { skills } = parseWithSchema(replaceTrainerSkillsBodySchema, req.body ?? {});
  const savedSkills = await replaceMyTrainerSkills(req.user.id, skills);
  return sendSuccess(res, { skills: savedSkills });
});

export const getMyTraineeSkillsHandler = asyncHandler(async (req, res) => {
  const skills = await getMyTraineeSkills(req.user.id);
  return sendSuccess(res, { skills });
});

export const getMyTrainerSkillsHandler = asyncHandler(async (req, res) => {
  const skills = await getMyTrainerSkills(req.user.id);
  return sendSuccess(res, { skills });
});

