import { z } from 'zod';
import { AppError } from '../../shared/AppError.js';
import { PAGINATION_DEFAULTS } from '../../shared/constants.js';

export const listSkillsQuerySchema = z.object({
  category: z
    .string()
    .trim()
    .min(1, 'category must not be empty')
    .max(120, 'category must be 120 characters or fewer')
    .optional(),
  page: z.coerce
    .number()
    .int('page must be an integer')
    .min(PAGINATION_DEFAULTS.PAGE, `page must be at least ${PAGINATION_DEFAULTS.PAGE}`)
    .default(PAGINATION_DEFAULTS.PAGE),
  pageSize: z.coerce
    .number()
    .int('pageSize must be an integer')
    .min(1, 'pageSize must be at least 1')
    .max(
      PAGINATION_DEFAULTS.MAX_PAGE_SIZE,
      `pageSize must be ${PAGINATION_DEFAULTS.MAX_PAGE_SIZE} or fewer`,
    )
    .default(PAGINATION_DEFAULTS.PAGE_SIZE),
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

