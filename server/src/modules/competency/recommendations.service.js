import { AppError } from '../../shared/AppError.js';
import {
  findRecommendedTrainersBySkill,
  findSkillSummaryById,
} from './recommendations.repository.js';

const PROFICIENCY_LABELS = Object.freeze({
  1: 'BEGINNER',
  2: 'INTERMEDIATE',
  3: 'ADVANCED',
  4: 'EXPERT',
});

function buildRecommendationExplanation(skill, proficiency, proficiencyLabel, yearsOfExperience) {
  const experienceText =
    yearsOfExperience === 1 ? "1 year's experience" : `${yearsOfExperience} years' experience`;

  return {
    matchedSkill: skill.name,
    proficiency,
    proficiencyLabel,
    yearsOfExperience,
    summary: `Matches ${skill.name}; ${proficiencyLabel.toLowerCase()} proficiency; ${experienceText}.`,
  };
}

function mapRecommendedTrainerRow(row, skill) {
  const proficiency = Number(row.proficiency);
  const proficiencyLabel = PROFICIENCY_LABELS[proficiency] || 'UNKNOWN';
  const yearsOfExperience = Number(row.yearsOfExperience);

  return {
    trainerId: String(row.trainerId),
    fullName: row.fullName,
    headline: row.headline ?? null,
    organization: row.organization ?? null,
    subjectExpertise: row.subjectExpertise ?? null,
    proficiency,
    proficiencyLabel,
    yearsOfExperience,
    explanation: buildRecommendationExplanation(
      skill,
      proficiency,
      proficiencyLabel,
      yearsOfExperience,
    ),
  };
}

/**
 * Compute deterministic, explainable trainer recommendations for a canonical skill.
 *
 * @param {{ skillId: string, page: number, pageSize: number }} params
 */
export async function getTrainerRecommendations({ skillId, page, pageSize }) {
  try {
    const rawSkill = await findSkillSummaryById(skillId);
    if (!rawSkill) {
      throw new AppError(404, 'SKILL_NOT_FOUND', `Skill ${skillId} was not found`);
    }

    const skill = {
      id: String(rawSkill.id),
      name: rawSkill.name,
      category: rawSkill.category,
    };

    const offset = (page - 1) * pageSize;
    const { items, totalItems } = await findRecommendedTrainersBySkill({
      skillId: skill.id,
      limit: pageSize,
      offset,
    });

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return {
      skill,
      items: items.map((row) => mapRecommendedTrainerRow(row, skill)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

