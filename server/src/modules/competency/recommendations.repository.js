import { executeQuery } from '../../config/db.js';
import { PAGINATION_DEFAULTS, ROLES, USER_STATUSES } from '../../shared/constants.js';

/**
 * Fetches canonical skill metadata by primary key.
 *
 * @param {string} skillId
 * @returns {Promise<{ id: string | number, name: string, category: string } | null>}
 */
export async function findSkillSummaryById(skillId) {
  const result = await executeQuery(
    `SELECT id, name, category
     FROM skills
     WHERE id = $1`,
    [skillId],
  );

  return result?.rows?.[0] ?? null;
}

/**
 * Fetches paginated, deterministically ranked ACTIVE TRAINER recommendations
 * matching the exact canonical `skillId`.
 *
 * Ranking rules (PRD Section 6.8 & FR-13):
 * 1. Exact `trainer_skills.skill_id` match
 * 2. Eligible trainers only (`u.role = 'TRAINER'` AND `u.status = 'ACTIVE'`)
 * 3. `ts.proficiency DESC`
 * 4. `ts.years_of_experience DESC` (skill-specific experience only)
 * 5. Tie-breakers: `LOWER(u.full_name) ASC, u.id ASC`
 *
 * @param {object} params
 * @param {string} params.skillId
 * @param {number} [params.limit]
 * @param {number} [params.offset]
 */
export async function findRecommendedTrainersBySkill({
  skillId,
  limit = PAGINATION_DEFAULTS.PAGE_SIZE,
  offset = 0,
}) {
  const filterParams = [skillId, ROLES.TRAINER, USER_STATUSES.ACTIVE];

  const countResult = await executeQuery(
    `SELECT COUNT(*)::int AS "totalItems"
     FROM trainer_skills ts
     INNER JOIN users u ON u.id = ts.trainer_id
     WHERE ts.skill_id = $1
       AND u.role = $2
       AND u.status = $3`,
    filterParams,
  );

  const totalItems = Number(countResult?.rows?.[0]?.totalItems ?? 0);
  if (totalItems === 0) {
    return { items: [], totalItems: 0 };
  }

  const rowsResult = await executeQuery(
    `SELECT
       u.id AS "trainerId",
       u.full_name AS "fullName",
       tp.headline,
       tp.organization,
       tp.subject_expertise AS "subjectExpertise",
       ts.proficiency,
       ts.years_of_experience AS "yearsOfExperience"
     FROM trainer_skills ts
     INNER JOIN users u ON u.id = ts.trainer_id
     LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
     WHERE ts.skill_id = $1
       AND u.role = $2
       AND u.status = $3
     ORDER BY
       ts.proficiency DESC,
       ts.years_of_experience DESC,
       LOWER(u.full_name) ASC,
       u.id ASC
     LIMIT $4
     OFFSET $5`,
    [...filterParams, limit, offset],
  );

  return {
    items: rowsResult?.rows ?? [],
    totalItems,
  };
}

