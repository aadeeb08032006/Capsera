/**
 * Shared API client wrapper targeting `/api/v1`.
 *
 * Note (docs/DECISIONS.md — OPEN-001):
 * PRD Section 9.1 states: "HTTP client: Axios or `fetch`; team must standardize on one client."
 * This starter uses native `fetch` so no unapproved dependency is locked in before team sign-off.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export async function apiRequest(endpoint, options = {}) {
  const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || (payload && payload.success === false)) {
    const error = new Error(payload?.error?.message || `Request failed with status ${response.status}`);
    error.code = payload?.error?.code || 'HTTP_ERROR';
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function fetchApiHealth(checkDb = false) {
  const query = checkDb ? '?db=true' : '';
  return apiRequest(`/health${query}`, { method: 'GET' });
}

