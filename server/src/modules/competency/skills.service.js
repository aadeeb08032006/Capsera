import { AppError } from '../../shared/AppError.js';
import { createSkill as insertSkill, findAllSkills } from './skills.repository.js';

function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapSkillRow(row) {
  return {
    id: String(row.id),
    name: row.name,
    category: row.category,
    createdAt: toIsoString(row.createdAt),
  };
}

/**
 * List skills from the canonical catalogue with optional exact category
 * filtering and pagination.
 *
 * @param {{ category?: string, page: number, pageSize: number }} filters
 */
export async function listSkills({ category, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const { items, totalItems } = await findAllSkills({
    category,
    limit: pageSize,
    offset,
  });

  return {
    items: items.map(mapSkillRow),
    page,
    pageSize,
    totalItems,
  };
}

/**
 * Create a new skill in the canonical catalogue.
 * Relies on PostgreSQL's `uq_skills_name_ci` unique index as the final authority
 * for case-insensitive duplicate detection, including under concurrent requests.
 *
 * @param {{ name: string, category: string }} payload
 */
export async function createSkill({ name, category }) {
  try {
    const row = await insertSkill({ name, category });
    if (!row) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
    }
    return mapSkillRow(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error?.code === '23505' && error?.constraint === 'uq_skills_name_ci') {
      throw new AppError(409, 'CONFLICT', 'A skill with this name already exists');
    }
    if (error?.code === '23514') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request violates database constraints');
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

