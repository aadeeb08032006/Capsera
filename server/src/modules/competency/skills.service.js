import { findAllSkills } from './skills.repository.js';

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

