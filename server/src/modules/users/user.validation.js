import { z } from 'zod';

export const getUsersQuerySchema = z
  .object({
    role: z.enum(['TRAINEE', 'TRAINER', 'ADMIN']).optional(),
    status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
    pageSize: z.coerce.number().int().min(1, 'PageSize must be at least 1').max(100, 'PageSize cannot exceed 100').default(20),
  })
  .strict();

export const updateStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'REJECTED', 'SUSPENDED', 'PENDING'], {
      error: 'Invalid status value',
    }),
    reason: z.string().max(500, 'Reason must not exceed 500 characters').optional().nullable(),
  })
  .strict();

export const updateRoleSchema = z
  .object({
    role: z.enum(['TRAINEE', 'TRAINER'], {
      error: 'Role must be TRAINEE or TRAINER',
    }),
  })
  .strict();

export const userIdParamSchema = z
  .object({
    userId: z.string().regex(/^\d+$/, 'User ID must be a valid numeric identifier'),
  })
  .strict();

export function getValidationMessage(error) {
  return error.issues
    .map((issue) => {
      const field = issue.path.join('.');
      return field ? `${field}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
