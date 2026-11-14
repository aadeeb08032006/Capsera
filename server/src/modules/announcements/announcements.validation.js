import { z } from 'zod';
import { paginationQueryFields, parseWithSchema } from '../competency/skills.validation.js';

export { parseWithSchema };

export const ANNOUNCEMENT_CATEGORIES = Object.freeze({
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  ACHIEVEMENT: 'ACHIEVEMENT',
  NEW_CONTENT: 'NEW_CONTENT',
});

export const ANNOUNCEMENT_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
});

const CATEGORY_VALUES = Object.values(ANNOUNCEMENT_CATEGORIES);
const STATUS_VALUES = Object.values(ANNOUNCEMENT_STATUSES);
const POSITIVE_BIGINT_REGEX = /^[1-9]\d{0,18}$/;
const MAX_POSTGRES_BIGINT = 9223372036854775807n;

const positiveAnnouncementIdSchema = z
  .string({ error: 'announcementId is required' })
  .trim()
  .regex(POSITIVE_BIGINT_REGEX, 'announcementId must be a positive integer')
  .refine((val) => !POSITIVE_BIGINT_REGEX.test(val) || BigInt(val) <= MAX_POSTGRES_BIGINT, {
    message: 'announcementId exceeds supported BIGINT range',
  });

const optionalIsoDateSchema = z
  .string()
  .trim()
  .datetime({ offset: true, message: 'expiresAt must be a valid ISO 8601 datetime with timezone' })
  .nullable()
  .optional();

export const announcementIdParamSchema = z.object({
  announcementId: positiveAnnouncementIdSchema,
});

export const listAnnouncementsQuerySchema = z.object({
  category: z.enum(CATEGORY_VALUES).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  scope: z.enum(['public', 'admin']).default('public'),
  ...paginationQueryFields,
});

export const createAnnouncementBodySchema = z.strictObject({
  title: z
    .string({ error: 'title is required' })
    .trim()
    .min(1, 'title must not be empty')
    .max(200, 'title must be 200 characters or fewer'),
  body: z
    .string({ error: 'body is required' })
    .trim()
    .min(1, 'body must not be empty')
    .max(20000, 'body must be 20000 characters or fewer'),
  category: z.enum(CATEGORY_VALUES, {
    error: 'category must be ANNOUNCEMENT, ACHIEVEMENT, or NEW_CONTENT',
  }),
  status: z.enum([ANNOUNCEMENT_STATUSES.DRAFT, ANNOUNCEMENT_STATUSES.PUBLISHED]).default(
    ANNOUNCEMENT_STATUSES.DRAFT,
  ),
  expiresAt: optionalIsoDateSchema,
});

export const updateAnnouncementBodySchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1, 'title must not be empty')
      .max(200, 'title must be 200 characters or fewer')
      .optional(),
    body: z
      .string()
      .trim()
      .min(1, 'body must not be empty')
      .max(20000, 'body must be 20000 characters or fewer')
      .optional(),
    category: z.enum(CATEGORY_VALUES).optional(),
    status: z.enum(STATUS_VALUES).optional(),
    expiresAt: optionalIsoDateSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });