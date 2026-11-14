import { z } from 'zod';
import {
  courseIdParamSchema,
  optionalNullableTrimmedString,
  parseWithSchema,
  positiveIdSchema,
} from './course.validation.js';

export { courseIdParamSchema, parseWithSchema };

export const lessonIdParamSchema = z.object({
  lessonId: positiveIdSchema,
});

export const createLessonBodySchema = z.strictObject({
  title: z
    .string({ error: 'title is required' })
    .trim()
    .min(1, 'title must not be empty')
    .max(200, 'title must be 200 characters or fewer'),
  content: optionalNullableTrimmedString(50000, 'content'),
  position: z.number().int().min(1, 'position must be at least 1').max(10000).optional(),
  estimatedDurationMinutes: z
    .number()
    .int()
    .min(1, 'estimatedDurationMinutes must be at least 1')
    .max(10080, 'estimatedDurationMinutes must be 10080 or fewer')
    .nullable()
    .optional(),
});

export const updateLessonBodySchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1, 'title must not be empty')
      .max(200, 'title must be 200 characters or fewer')
      .optional(),
    content: optionalNullableTrimmedString(50000, 'content'),
    position: z.number().int().min(1, 'position must be at least 1').max(10000).optional(),
    estimatedDurationMinutes: z
      .number()
      .int()
      .min(1, 'estimatedDurationMinutes must be at least 1')
      .max(10080, 'estimatedDurationMinutes must be 10080 or fewer')
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one updatable field must be provided',
  });

export const reorderLessonsBodySchema = z
  .strictObject({
    lessonIds: z
      .array(positiveIdSchema)
      .min(1, 'lessonIds must contain at least one lesson ID'),
  })
  .refine((data) => new Set(data.lessonIds).size === data.lessonIds.length, {
    message: 'lessonIds must not contain duplicates',
  });

