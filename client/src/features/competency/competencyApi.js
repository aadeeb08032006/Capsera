import { apiRequest } from '../../services/apiClient.js';

/**
 * List skills from the canonical skill catalogue with optional exact category
 * filtering and pagination.
 *
 * @param {object} [params]
 * @param {string} [params.category] - Optional exact category filter
 * @param {number} [params.page] - 1-based page number (server default: 1)
 * @param {number} [params.pageSize] - Page size 1..100 (server default: 20)
 * @param {RequestInit} [options] - Optional fetch options (e.g. AbortSignal)
 * @returns {Promise<{ items: Array<{ id: string, name: string, category: string, createdAt: string }>, pagination: { page: number, pageSize: number, totalItems: number, totalPages: number } }>}
 */
export async function listSkills({ category, page, pageSize } = {}, options = {}) {
  const searchParams = new URLSearchParams();

  if (typeof category === 'string' && category.trim() !== '') {
    searchParams.set('category', category.trim());
  }
  if (page !== undefined && page !== null) {
    searchParams.set('page', String(page));
  }
  if (pageSize !== undefined && pageSize !== null) {
    searchParams.set('pageSize', String(pageSize));
  }

  const query = searchParams.toString();
  const endpoint = query ? `/skills?${query}` : '/skills';
  const payload = await apiRequest(endpoint, { ...options, method: 'GET' });
  return payload.data;
}

/**
 * Fetch all skills across all catalogue pages (using max pageSize=100) so
 * skill mapping selectors are never truncated at the default 20-item page.
 *
 * @param {RequestInit} [options] - Optional fetch options (e.g. AbortSignal)
 * @returns {Promise<Array<{ id: string, name: string, category: string, createdAt: string }>>}
 */
export async function listAllSkills(options = {}) {
  const pageSize = 100;
  const firstPage = await listSkills({ page: 1, pageSize }, options);
  const allItems = [...(firstPage.items ?? [])];
  const totalPages = firstPage.pagination?.totalPages ?? 1;

  if (totalPages > 1) {
    const remainingPages = [];
    for (let page = 2; page <= totalPages; page += 1) {
      remainingPages.push(listSkills({ page, pageSize }, options));
    }
    const results = await Promise.all(remainingPages);
    for (const pageData of results) {
      allItems.push(...(pageData.items ?? []));
    }
  }

  return allItems;
}

/**
 * Create a new skill in the canonical catalogue (ACTIVE ADMIN only).
 *
 * @param {{ name: string, category: string }} skillInput
 * @param {RequestInit} [options] - Optional fetch options
 * @returns {Promise<{ id: string, name: string, category: string, createdAt: string }>}
 */
export async function createSkill({ name, category }, options = {}) {
  const payload = await apiRequest('/skills', {
    ...options,
    method: 'POST',
    body: JSON.stringify({ name, category }),
  });
  return payload.data.skill;
}

/**
 * Fetch saved skill mappings for the authenticated ACTIVE TRAINEE.
 *
 * @param {RequestInit} [options] - Optional fetch options (e.g. AbortSignal)
 * @returns {Promise<Array<{ id: string, skillId: string, skillName: string, category: string, proficiency: number }>>}
 */
export async function getMyTraineeSkills(options = {}) {
  const payload = await apiRequest('/profiles/me/skills', {
    ...options,
    method: 'GET',
  });
  return payload.data.skills ?? [];
}

/**
 * Atomically replace all skill mappings for the authenticated ACTIVE TRAINEE.
 * Passing an empty array clears all existing mappings.
 *
 * @param {Array<{ skillId: string, proficiency: number }>} skills
 * @param {RequestInit} [options] - Optional fetch options
 * @returns {Promise<Array<{ id: string, skillId: string, skillName: string, category: string, proficiency: number }>>}
 */
export async function replaceMyTraineeSkills(skills = [], options = {}) {
  const payload = await apiRequest('/profiles/me/skills', {
    ...options,
    method: 'PUT',
    body: JSON.stringify({ skills }),
  });
  return payload.data.skills ?? [];
}

/**
 * Fetch saved skill mappings for the authenticated ACTIVE TRAINER.
 *
 * @param {RequestInit} [options] - Optional fetch options (e.g. AbortSignal)
 * @returns {Promise<Array<{ id: string, skillId: string, skillName: string, category: string, proficiency: number, yearsOfExperience: number }>>}
 */
export async function getMyTrainerSkills(options = {}) {
  const payload = await apiRequest('/profiles/me/trainer-skills', {
    ...options,
    method: 'GET',
  });
  return payload.data.skills ?? [];
}

/**
 * Atomically replace all skill mappings for the authenticated ACTIVE TRAINER.
 * Passing an empty array clears all existing mappings.
 *
 * @param {Array<{ skillId: string, proficiency: number, yearsOfExperience: number }>} skills
 * @param {RequestInit} [options] - Optional fetch options
 * @returns {Promise<Array<{ id: string, skillId: string, skillName: string, category: string, proficiency: number, yearsOfExperience: number }>>}
 */
export async function replaceMyTrainerSkills(skills = [], options = {}) {
  const payload = await apiRequest('/profiles/me/trainer-skills', {
    ...options,
    method: 'PUT',
    body: JSON.stringify({ skills }),
  });
  return payload.data.skills ?? [];
}
