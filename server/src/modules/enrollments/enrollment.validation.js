import { z } from 'zod';
import { AppError } from '../../shared/AppError.js';

const POSITIVE_BIGINT_STRING_REGEX = /^[1-9]\d{0,18}$/;

export const positiveIdSchema = z
  .string()
  .trim()
  .regex(POSITIVE_BIGINT_STRING_REGEX, 'ID must be a positive integer');

export const courseIdParamSchema = z.object({
  courseId: positiveIdSchema,
});

export const enrollmentIdParamSchema = z.object({
  enrollmentId: positiveIdSchema,
});

export function parseWithSchema(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path?.length ? `${issue.path.join('.')}: ` : '';
        return `${path}${issue.message}`;
      })
      .join('; ');

    throw new AppError(400, 'VALIDATION_ERROR', message || 'Validation failed');
  }
  return result.data;
}
