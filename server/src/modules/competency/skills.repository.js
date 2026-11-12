
import { executeQuery } from '../../config/db.js';
export async function findAllSkills() {
  const result = await executeQuery(`
    SELECT
      id,
      name,
      category,
      created_at AS "createdAt"
    FROM skills
    ORDER BY LOWER(name) ASC, id ASC
  `);

  return result.rows;
}

// fetches all skills from the canonical skill catalogue.
