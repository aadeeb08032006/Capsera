import { z } from 'zod';
import { RESOURCE_TYPES } from '../../shared/constants.js';
import {
  courseIdParamSchema,
  optionalNullableHttpUrlSchema,
  optionalNullableTrimmedString,
  parseWithSchema,
  positiveIdSchema,
} from './course.validation.js';

export { courseIdParamSchema, parseWithSchema };

export const resourceTypeSchema = z.enum([
  RESOURCE_TYPES.VIDEO,
  RESOURCE_TYPES.PRESENTATION,
  RESOURCE_TYPES.DOCUMENT,
  RESOURCE_TYPES.LINK,
  RESOURCE_TYPES.OTHER,
]);

const optionalNullableLessonIdSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  positiveIdSchema.nullable().optional(),
);

const optionalMultipartPositionSchema = z.preprocess(
  (value) => (value === '' || value === undefined || value === null ? undefined : Number(value)),
  z.number().int().min(1, 'position must be at least 1').max(10000).optional(),
);

export const courseResourceParamsSchema = z.object({
  courseId: positiveIdSchema,
  resourceId: positiveIdSchema,
});

export const listResourcesQuerySchema = z.object({
  lessonId: optionalNullableLessonIdSchema,
  resourceType: resourceTypeSchema.optional(),
});

export const createResourceBodySchema = z.strictObject({
  title: z
    .string({ error: 'title is required' })
    .trim()
    .min(1, 'title must not be empty')
    .max(200, 'title must be 200 characters or fewer'),
  description: optionalNullableTrimmedString(2000, 'description'),
  resourceType: resourceTypeSchema.optional(),
  lessonId: optionalNullableLessonIdSchema,
  externalUrl: optionalNullableHttpUrlSchema('externalUrl'),
  position: optionalMultipartPositionSchema,
});

