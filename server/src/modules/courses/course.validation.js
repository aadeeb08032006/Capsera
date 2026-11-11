import { z } from 'zod';
import { AppError } from '../../shared/AppError.js';
import { COURSE_STATUSES } from '../../shared/constants.js';

export const COURSE_LEVELS = Object.freeze({
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
});

const POSITIVE_BIGINT_STRING_REGEX = /^[1-9]\d{0,18}$/;

export const positiveIdSchema = z
  .string()
  .trim()
  .regex(POSITIVE_BIGINT_STRING_REGEX, 'ID must be a positive integer');

const optionalNullableUrlSchema = z
  .string()
  .trim()
  .max(2048, 'thumbnailUrl must be 2048 characters or fewer')
  .transform((val) => (val.length === 0 ? null : val))
  .refine((value) => {
    if (value === null) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'thumbnailUrl must be a valid http or https URL')
  .nullable()
  .optional();

const optionalNullableTrimmedString = (maxLength, fieldName) =>
  z
    .string()
    .trim()
    .max(maxLength, `${fieldName} must be ${maxLength} characters or fewer`)
    .transform((val) => (val.length === 0 ? null : val))
    .nullable()
    .optional();

export const courseIdParamSchema = z.object({
  courseId: positiveIdSchema,
});

export const createCourseBodySchema = z.strictObject({
  title: z
    .string({ error: 'title is required' })
    .trim()
    .min(1, 'title must not be empty')
    .max(200, 'title must be 200 characters or fewer'),
  summary: optionalNullableTrimmedString(500, 'summary'),
  description: optionalNullableTrimmedString(20000, 'description'),
  subject: optionalNullableTrimmedString(120, 'subject'),
  level: z
    .enum([COURSE_LEVELS.BEGINNER, COURSE_LEVELS.INTERMEDIATE, COURSE_LEVELS.ADVANCED])
    .nullable()
    .optional(),
  thumbnailUrl: optionalNullableUrlSchema,
  trainerId: positiveIdSchema.optional(),
});

export const updateCourseBodySchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1, 'title must not be empty')
      .max(200, 'title must be 200 characters or fewer')
      .optional(),
    summary: optionalNullableTrimmedString(500, 'summary'),
    description: optionalNullableTrimmedString(20000, 'description'),
    subject: optionalNullableTrimmedString(120, 'subject'),
    level: z
      .enum([COURSE_LEVELS.BEGINNER, COURSE_LEVELS.INTERMEDIATE, COURSE_LEVELS.ADVANCED])
      .nullable()
      .optional(),
    thumbnailUrl: optionalNullableUrlSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one updatable field must be provided',
  });

export const listCoursesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([COURSE_STATUSES.DRAFT, COURSE_STATUSES.PUBLISHED, COURSE_STATUSES.ARCHIVED])
    .optional(),
  subject: z.string().trim().min(1).max(120).optional(),
  level: z
    .enum([COURSE_LEVELS.BEGINNER, COURSE_LEVELS.INTERMEDIATE, COURSE_LEVELS.ADVANCED])
    .optional(),
  trainerId: positiveIdSchema.optional(),
  mine: z.enum(['true', 'false']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
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
