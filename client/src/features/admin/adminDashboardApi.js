import { apiRequest } from '../../services/apiClient.js';

/**
 * Fetch platform-wide Admin Dashboard counts and rates.
 *
 * @param {RequestInit} [options] - Optional fetch options (e.g. AbortSignal)
 * @returns {Promise<object>}
 */
export async function getDashboardSummary(options = {}) {
  const payload = await apiRequest('/admin/dashboard/summary', {
    ...options,
    method: 'GET',
  });
  return payload.data;
}

/**
 * Fetch platform-wide and subject-level assessment outcome metrics.
 *
 * @param {RequestInit} [options] - Optional fetch options (e.g. AbortSignal)
 * @returns {Promise<{ overall: object, bySubject: Array<object> }>}
 */
export async function getAssessmentPerformance(options = {}) {
  const payload = await apiRequest('/admin/dashboard/assessment-performance', {
    ...options,
    method: 'GET',
  });
  return payload.data;
}

