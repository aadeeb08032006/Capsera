import { z } from 'zod';
import { paginationQueryFields, positiveBigIntIdSchema } from './skills.validation.js';

export const trainerRecommendationsQuerySchema = z.object({
  skillId: positiveBigIntIdSchema,
  ...paginationQueryFields,
});

