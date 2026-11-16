/**
 * Shared API client wrapper targeting `/api/v1`.
 *
 * Uses native `fetch` with Bearer token authentication stored in `sessionStorage`
 * under key "capsera_token".
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const TOKEN_STORAGE_KEY = 'capsera_token';

export async function apiRequest(endpoint, options = {}) {
  const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || (payload && payload.success === false)) {
    if (response.status === 401 && token) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('capsera:unauthorized'));
      }
    }

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
