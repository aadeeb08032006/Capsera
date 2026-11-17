import { AppError } from '../../shared/AppError.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/response.js';
import {
  getProfile,
  upsertTraineeProfile,
  upsertTrainerProfile,
} from './profile.service.js';
import {
  getValidationMessage,
  traineeProfileSchema,
  trainerProfileSchema,
} from './profile.validation.js';

function validate(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', getValidationMessage(result.error));
  }
  return result.data;
}

export const getMyProfile = asyncHandler(async (req, res) => {
  const data = await getProfile(req.user);
  return sendSuccess(res, data);
});

export const updateTraineeProfile = asyncHandler(async (req, res) => {
  const input = validate(traineeProfileSchema, req.body);
  const data = await upsertTraineeProfile(req.user.id, input);
  return sendSuccess(res, data);
});

export const updateTrainerProfile = asyncHandler(async (req, res) => {
  const input = validate(trainerProfileSchema, req.body);
  const data = await upsertTrainerProfile(req.user.id, input);
  return sendSuccess(res, data);
});
