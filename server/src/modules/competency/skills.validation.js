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

export const createSkillBodySchema = z.strictObject({
  name: z
    .string({ error: 'name is required' })
    .trim()
    .min(1, 'name must not be empty')
    .max(120, 'name must be 120 characters or fewer'),
  category: z
    .string({ error: 'category is required' })
    .trim()
    .min(1, 'category must not be empty')
    .max(120, 'category must be 120 characters or fewer'),
});

const POSITIVE_BIGINT_STRING_REGEX = /^[1-9]\d{0,18}$/;
const MAX_POSTGRES_BIGINT = 9223372036854775807n;

export const positiveBigIntIdSchema = z
  .string({ error: 'skillId is required' })
  .trim()
  .regex(POSITIVE_BIGINT_STRING_REGEX, 'skillId must be a positive integer')
  .refine(
    (val) => POSITIVE_BIGINT_STRING_REGEX.test(val) && BigInt(val) <= MAX_POSTGRES_BIGINT,
    'skillId exceeds PostgreSQL BIGINT range',
  );

export const proficiencySchema = z
  .number({ error: 'proficiency must be an integer between 1 and 4' })
  .int('proficiency must be an integer')
  .min(1, 'proficiency must be between 1 and 4')
  .max(4, 'proficiency must be between 1 and 4');

export const yearsOfExperienceSchema = z
  .number({ error: 'yearsOfExperience must be a number between 0 and 80' })
  .finite('yearsOfExperience must be a finite number')
  .min(0, 'yearsOfExperience must be between 0 and 80')
  .max(80, 'yearsOfExperience must be between 0 and 80')
  .refine(
    (val) => Math.abs(Math.round(val * 10) - val * 10) < 1e-12,
    'yearsOfExperience must have at most 1 decimal place',
  );

export const traineeSkillItemSchema = z.strictObject({
  skillId: positiveBigIntIdSchema,
  proficiency: proficiencySchema,
});

export const trainerSkillItemSchema = z.strictObject({
  skillId: positiveBigIntIdSchema,
  proficiency: proficiencySchema,
  yearsOfExperience: yearsOfExperienceSchema,
});

function createReplaceSkillsBodySchema(itemSchema) {
  return z.strictObject({
    skills: z
      .array(itemSchema, { error: 'skills must be an array' })
      .superRefine((items, ctx) => {
        const seen = new Set();
        items.forEach((item, index) => {
          if (seen.has(item.skillId)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'skillId'],
              message: `Duplicate skillId: ${item.skillId}`,
            });
          }
          seen.add(item.skillId);
        });
      }),
  });
}

export const replaceTraineeSkillsBodySchema = createReplaceSkillsBodySchema(traineeSkillItemSchema);
export const replaceTrainerSkillsBodySchema = createReplaceSkillsBodySchema(trainerSkillItemSchema);

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

