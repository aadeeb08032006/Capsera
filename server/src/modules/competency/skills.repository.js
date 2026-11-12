import { executeQuery } from '../../config/db.js';
import { PAGINATION_DEFAULTS } from '../../shared/constants.js';

/**
 * Fetches paginated skills from the canonical skill catalogue with optional
 * exact category filtering and deterministic alphabetical ordering.
 *
 * @param {object} [options]
 * @param {string} [options.category] - Optional exact category filter
 * @param {number} [options.limit] - Maximum number of rows to return
 * @param {number} [options.offset] - Number of rows to skip
 * @returns {Promise<{ items: Array<{ id: string | number, name: string, category: string, createdAt: Date | string }>, totalItems: number }>}
 */
export async function findAllSkills({
  category,
  limit = PAGINATION_DEFAULTS.PAGE_SIZE,
  offset = 0,
} = {}) {
  const conditions = [];
  const params = [];

  if (category !== undefined && category !== null) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await executeQuery(
    `SELECT COUNT(*)::int AS "totalItems"
     FROM skills
     ${whereSql}`,
    [...params],
  );

  const totalItems = Number(countResult?.rows?.[0]?.totalItems ?? 0);
  if (totalItems === 0) {
    return { items: [], totalItems: 0 };
  }

  const limitParam = `$${params.length + 1}`;
  const offsetParam = `$${params.length + 2}`;

  const result = await executeQuery(
    `SELECT
       id,
       name,
       category,
       created_at AS "createdAt"
     FROM skills
     ${whereSql}
     ORDER BY LOWER(name) ASC, id ASC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    [...params, limit, offset],
  );

  return {
    items: result?.rows ?? [],
    totalItems,
  };
}

/**
 * Inserts a new skill into the canonical skill catalogue.
 * Uniqueness (including case-insensitive duplicates) is enforced by `uq_skills_name_ci`.
 *
 * @param {{ name: string, category: string }} skill
 * @returns {Promise<{ id: string | number, name: string, category: string, createdAt: Date | string } | null>}
 */
export async function createSkill({ name, category }) {
  const result = await executeQuery(
    `INSERT INTO skills (name, category)
     VALUES ($1, $2)
     RETURNING
       id,
       name,
       category,
       created_at AS "createdAt"`,
    [name, category],
  );

  return result?.rows?.[0] ?? null;
}

/**
 * Acquires a row-level lock on the user record to serialize concurrent
 * skill-mapping replacements for the same trainee within a transaction.
 *
 * @param {string} userId
 * @param {import('pg').PoolClient} client
 */
export async function lockUserForSkillUpdate(userId, client) {
  const result = await client.query(
    'SELECT id FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  );
  return result?.rows?.[0] ?? null;
}

/**
 * Returns the subset of skill IDs from `skillIds` that exist in `skills`.
 *
 * @param {string[]} skillIds
 * @param {import('pg').PoolClient} client
 * @returns {Promise<string[]>}
 */
export async function findExistingSkillIds(skillIds, client) {
  if (!skillIds.length) {
    return [];
  }
  const result = await client.query(
    'SELECT id FROM skills WHERE id = ANY($1::bigint[])',
    [skillIds],
  );
  return (result?.rows ?? []).map((row) => String(row.id));
}

/**
 * Atomically replaces all skill mappings for a trainee within an active transaction.
 *
 * @param {string} traineeId
 * @param {Array<{ skillId: string, proficiency: number }>} skills
 * @param {import('pg').PoolClient} client
 */
export async function replaceTraineeSkillsInTx(traineeId, skills, client) {
  await client.query(
    'DELETE FROM trainee_skills WHERE trainee_id = $1',
    [traineeId],
  );

  if (skills.length === 0) {
    return [];
  }

  const skillIds = skills.map((item) => item.skillId);
  const proficiencies = skills.map((item) => item.proficiency);

  const result = await client.query(
    `WITH inserted AS (
       INSERT INTO trainee_skills (trainee_id, skill_id, proficiency)
       SELECT $1, skill_id, proficiency
       FROM UNNEST($2::bigint[], $3::smallint[]) AS t(skill_id, proficiency)
       RETURNING id, trainee_id, skill_id, proficiency
     )
     SELECT
       i.id,
       i.skill_id AS "skillId",
       s.name AS "skillName",
       s.category,
       i.proficiency
     FROM inserted i
     JOIN skills s ON s.id = i.skill_id
     ORDER BY LOWER(s.name) ASC, s.id ASC`,
    [traineeId, skillIds, proficiencies],
  );

  return result?.rows ?? [];
}
