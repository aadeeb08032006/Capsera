import { AppError } from '../../shared/AppError.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/response.js';
import { loginUser, signupUser } from './auth.service.js';
import { getValidationMessage, loginSchema, signupSchema } from './auth.validation.js';

function validate(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', getValidationMessage(result.error));
  }
  return result.data;
}

export const signup = asyncHandler(async (req, res) => {
  const input = validate(signupSchema, req.body);
  const user = await signupUser(input);
  return sendSuccess(res, { user }, 201);
});

export const login = asyncHandler(async (req, res) => {
  const input = validate(loginSchema, req.body);
  const result = await loginUser(input);
  return sendSuccess(res, result);
});

export const logout = asyncHandler(async (_req, res) => sendSuccess(res, { loggedOut: true }));

export const getCurrentUser = asyncHandler(async (req, res) =>
  sendSuccess(res, { user: req.user }),
);
