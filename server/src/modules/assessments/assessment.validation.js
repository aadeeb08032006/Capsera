import { z } from 'zod';
import { AppError } from '../../shared/AppError.js';
import { ASSESSMENT_STATUSES } from '../../shared/constants.js';

export const MCQ_OPTIONS = Object.freeze(['A', 'B', 'C', 'D']);

const POSITIVE_BIGINT_STRING_REGEX = /^[1-9]\d{0,18}$/;

export const positiveIdSchema = z
  .string({ error: 'ID is required' })
  .trim()
  .regex(POSITIVE_BIGINT_STRING_REGEX, 'ID must be a positive integer');

const optionalNullableTrimmedString = (maxLength, fieldName) =>
  z
    .string()
    .trim()
    .max(maxLength, `${fieldName} must be ${maxLength} characters or fewer`)
    .transform((val) => (val.length === 0 ? null : val))
    .nullable()
    .optional();

const optionalNullableIsoDateSchema = z
  .union([z.string().trim(), z.date()])
  .transform((val, ctx) => {
    if (typeof val === 'string' && val.length === 0) {
      return null;
    }
    const parsed = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'deadlineAt must be a valid ISO 8601 date string',
      });
      return z.NEVER;
    }
    return parsed.toISOString();
  })
  .nullable()
  .optional();

const passPercentageSchema = z
  .number({ error: 'passPercentage must be a number' })
  .finite('passPercentage must be a finite number')
  .gt(0, 'passPercentage must be greater than 0')
  .lte(100, 'passPercentage must be 100 or less');

// ─── Route Param Schemas ───

export const courseIdParamSchema = z.object({
  courseId: positiveIdSchema,
});

export const assessmentIdParamSchema = z.object({
  assessmentId: positiveIdSchema,
});

export const assessmentQuestionParamsSchema = z.object({
  assessmentId: positiveIdSchema,
  questionId: positiveIdSchema,
});

export const attemptIdParamSchema = z.object({
  attemptId: positiveIdSchema,
});

// ─── Assessment Schemas ───

export const createAssessmentBodySchema = z.strictObject({
  title: z
    .string({ error: 'title is required' })
    .trim()
    .min(1, 'title must not be empty')
    .max(200, 'title must be 200 characters or fewer'),
  instructions: optionalNullableTrimmedString(10000, 'instructions'),
  deadlineAt: optionalNullableIsoDateSchema,
  durationMinutes: z
    .number({ error: 'durationMinutes must be an integer' })
    .int('durationMinutes must be an integer')
    .min(1, 'durationMinutes must be at least 1')
    .nullable()
    .optional(),
  maxAttempts: z
    .number({ error: 'maxAttempts must be an integer' })
    .int('maxAttempts must be an integer')
    .min(1, 'maxAttempts must be at least 1')
    .default(1),
  passPercentage: passPercentageSchema.default(60),
  isRequired: z.boolean({ error: 'isRequired must be a boolean' }).default(true),
});

export const updateAssessmentBodySchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1, 'title must not be empty')
      .max(200, 'title must be 200 characters or fewer')
      .optional(),
    instructions: optionalNullableTrimmedString(10000, 'instructions'),
    deadlineAt: optionalNullableIsoDateSchema,
    durationMinutes: z
      .number({ error: 'durationMinutes must be an integer' })
      .int('durationMinutes must be an integer')
      .min(1, 'durationMinutes must be at least 1')
      .nullable()
      .optional(),
    maxAttempts: z
      .number({ error: 'maxAttempts must be an integer' })
      .int('maxAttempts must be an integer')
      .min(1, 'maxAttempts must be at least 1')
      .optional(),
    passPercentage: passPercentageSchema.optional(),
    isRequired: z.boolean({ error: 'isRequired must be a boolean' }).optional(),
    status: z.enum([ASSESSMENT_STATUSES.CLOSED]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one updatable field must be provided',
  });

export const listAssessmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([ASSESSMENT_STATUSES.DRAFT, ASSESSMENT_STATUSES.PUBLISHED, ASSESSMENT_STATUSES.CLOSED])
    .optional(),
});

// ─── Question Schemas ───

const requiredOptionTextSchema = (fieldName) =>
  z
    .string({ error: `${fieldName} is required` })
    .trim()
    .min(1, `${fieldName} must not be empty`)
    .max(2000, `${fieldName} must be 2000 characters or fewer`);

export const createQuestionBodySchema = z.strictObject({
  questionOrder: z
    .number({ error: 'questionOrder must be an integer' })
    .int('questionOrder must be an integer')
    .min(1, 'questionOrder must be at least 1')
    .optional(),
  questionText: z
    .string({ error: 'questionText is required' })
    .trim()
    .min(1, 'questionText must not be empty')
    .max(5000, 'questionText must be 5000 characters or fewer'),
  optionA: requiredOptionTextSchema('optionA'),
  optionB: requiredOptionTextSchema('optionB'),
  optionC: requiredOptionTextSchema('optionC'),
  optionD: requiredOptionTextSchema('optionD'),
  correctOption: z.enum(MCQ_OPTIONS, {
    error: 'correctOption must be one of A, B, C, or D',
  }),
  explanation: optionalNullableTrimmedString(5000, 'explanation'),
  points: z
    .number({ error: 'points must be an integer' })
    .int('points must be an integer')
    .min(1, 'points must be at least 1')
    .default(1),
});

export const updateQuestionBodySchema = z
  .strictObject({
    questionOrder: z
      .number({ error: 'questionOrder must be an integer' })
      .int('questionOrder must be an integer')
      .min(1, 'questionOrder must be at least 1')
      .optional(),
    questionText: z
      .string()
      .trim()
      .min(1, 'questionText must not be empty')
      .max(5000, 'questionText must be 5000 characters or fewer')
      .optional(),
    optionA: requiredOptionTextSchema('optionA').optional(),
    optionB: requiredOptionTextSchema('optionB').optional(),
    optionC: requiredOptionTextSchema('optionC').optional(),
    optionD: requiredOptionTextSchema('optionD').optional(),
    correctOption: z
      .enum(MCQ_OPTIONS, {
        error: 'correctOption must be one of A, B, C, or D',
      })
      .optional(),
    explanation: optionalNullableTrimmedString(5000, 'explanation'),
    points: z
      .number({ error: 'points must be an integer' })
      .int('points must be an integer')
      .min(1, 'points must be at least 1')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one updatable field must be provided',
  });

// ─── Attempt & Results Schemas ───

export const submitAttemptBodySchema = z.strictObject({
  answers: z
    .array(
      z.strictObject({
        questionId: positiveIdSchema,
        selectedOption: z
          .enum(MCQ_OPTIONS, {
            error: 'selectedOption must be one of A, B, C, D, or null',
          })
          .nullable(),
      }),
      { error: 'answers must be an array' },
    )
    .superRefine((answers, ctx) => {
      const seen = new Set();
      for (const item of answers) {
        if (seen.has(item.questionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate answer submitted for questionId ${item.questionId}`,
          });
          return;
        }
        seen.add(item.questionId);
      }
    }),
});

export const listMyAttemptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  courseId: positiveIdSchema.optional(),
  assessmentId: positiveIdSchema.optional(),
});

export const courseResultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  assessmentId: positiveIdSchema.optional(),
});

/**
 * Validate input against a Zod schema and throw canonical 400 VALIDATION_ERROR on failure.
 */
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
