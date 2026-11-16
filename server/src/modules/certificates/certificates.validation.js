import { z } from 'zod';
import { paginationQueryFields, parseWithSchema } from '../competency/skills.validation.js';

export { parseWithSchema };

export const CERTIFICATE_CODE_REGEX = /^[A-Za-z0-9-]+$/;

export const listMyCertificatesQuerySchema = z.object({
  ...paginationQueryFields,
});

export const verifyCertificateParamsSchema = z.object({
  certificateCode: z
    .string({ error: 'certificateCode is required' })
    .trim()
    .min(1, 'certificateCode must not be empty')
    .max(64, 'certificateCode must be 64 characters or fewer')
    .regex(
      CERTIFICATE_CODE_REGEX,
      'certificateCode must contain only letters, numbers, and hyphens',
    ),
});

