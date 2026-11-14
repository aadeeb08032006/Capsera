import { AppError } from '../../shared/AppError.js';
import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../shared/response.js';
import { listUsers, updateUserRole, updateUserStatus } from './user.service.js';
import {
  getUsersQuerySchema,
  getValidationMessage,
  updateRoleSchema,
  updateStatusSchema,
  userIdParamSchema,
} from './user.validation.js';

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', getValidationMessage(result.error));
  }
  return result.data;
}

export const getUsers = asyncHandler(async (req, res) => {
  const query = validate(getUsersQuerySchema, req.query);
  const result = await listUsers(query);
  return sendPaginated(res, result);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const { userId } = validate(userIdParamSchema, req.params);
  const body = validate(updateStatusSchema, req.body);
  const user = await updateUserStatus({
    targetUserId: userId,
    newStatus: body.status,
    reason: body.reason,
    adminUser: req.user,
  });
  return sendSuccess(res, { user });
});

export const updateRole = asyncHandler(async (req, res) => {
  const { userId } = validate(userIdParamSchema, req.params);
  const body = validate(updateRoleSchema, req.body);
  const user = await updateUserRole({
    targetUserId: userId,
    newRole: body.role,
    adminUser: req.user,
  });
  return sendSuccess(res, { user });
});
