import { apiRequest } from '../../services/apiClient.js';

/**
 * Fetch completion certificates earned by the authenticated trainee (read-only).
 *
 * @param {{ page?: number, pageSize?: number }} [params]
 * @param {RequestInit} [options]
 */
export async function listMyCertificates({ page, pageSize } = {}, options = {}) {
  const searchParams = new URLSearchParams();

  if (page !== undefined && page !== null) {
    searchParams.set('page', String(page));
  }
  if (pageSize !== undefined && pageSize !== null) {
    searchParams.set('pageSize', String(pageSize));
  }

  const query = searchParams.toString();
  const endpoint = query ? `/certificates/me?${query}` : '/certificates/me';
  const payload = await apiRequest(endpoint, { ...options, method: 'GET' });
  return payload.data;
}

/**
 * Publicly verify a certificate code against PostgreSQL.
 *
 * @param {string} certificateCode
 * @param {RequestInit} [options]
 */
export async function verifyCertificate(certificateCode, options = {}) {
  const normalizedCode = typeof certificateCode === 'string' ? certificateCode.trim() : '';
  const endpoint = `/certificates/verify/${encodeURIComponent(normalizedCode)}`;
  const payload = await apiRequest(endpoint, { ...options, method: 'GET' });
  return payload.data.certificate;
}

