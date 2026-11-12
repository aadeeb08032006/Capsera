import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import {
  createSkill as insertSkill,
  findAllSkills,
  findExistingSkillIds,
  lockUserForSkillUpdate,
  replaceTraineeSkillsInTx,
} from './skills.repository.js';

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

function mapTraineeSkillRow(row) {
  return {
    id: String(row.id),
    skillId: String(row.skillId),
    skillName: row.skillName,
    category: row.category,
    proficiency: Number(row.proficiency),
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

/**
 * Atomically replace all skill mappings for the authenticated trainee.
 * Serializes concurrent replacements for the same trainee using FOR UPDATE on `users`.
 *
 * @param {string} traineeId
 * @param {Array<{ skillId: string, proficiency: number }>} skills
 */
export async function replaceMyTraineeSkills(traineeId, skills) {
  try {
    return await withTransaction(async (client) => {
      const lockedUser = await lockUserForSkillUpdate(traineeId, client);
      if (!lockedUser) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
      }

      if (skills.length > 0) {
        const requestedIds = skills.map((item) => item.skillId);
        const existingIds = new Set(await findExistingSkillIds(requestedIds, client));
        const missingIds = requestedIds.filter((id) => !existingIds.has(id));
        if (missingIds.length > 0) {
          throw new AppError(
            404,
            'SKILL_NOT_FOUND',
            `One or more specified skills were not found: ${missingIds.join(', ')}`,
          );
        }
      }

      const rows = await replaceTraineeSkillsInTx(traineeId, skills, client);
      return rows.map(mapTraineeSkillRow);
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error?.code === '23503' || error?.code === '23514' || error?.code === '22P02') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request violates database constraints');
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

