import { apiRequest } from '../../services/apiClient.js';

export const ANNOUNCEMENT_CATEGORIES = [
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'ACHIEVEMENT', label: 'Achievement' },
  { value: 'NEW_CONTENT', label: 'New Content' },
];

export const ANNOUNCEMENT_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

/**
 * Fetch published, non-expired announcements for the public homepage feed.
 *
 * @param {{ category?: string, page?: number, pageSize?: number }} [params]
 * @param {RequestInit} [options]
 */
export async function listPublicAnnouncements({ category, page, pageSize } = {}, options = {}) {
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
  const endpoint = query ? `/announcements?${query}` : '/announcements';
  const payload = await apiRequest(endpoint, { ...options, method: 'GET' });
  return payload.data;
}

/**
 * Fetch all announcements (including drafts and archived) for Admin management.
 *
 * @param {{ category?: string, status?: string, page?: number, pageSize?: number }} [params]
 * @param {RequestInit} [options]
 */
export async function listAdminAnnouncements(
  { category, status, page, pageSize } = {},
  options = {},
) {
  const searchParams = new URLSearchParams();
  searchParams.set('scope', 'admin');

  if (typeof category === 'string' && category.trim() !== '') {
    searchParams.set('category', category.trim());
  }
  if (typeof status === 'string' && status.trim() !== '') {
    searchParams.set('status', status.trim());
  }
  if (page !== undefined && page !== null) {
    searchParams.set('page', String(page));
  }
  if (pageSize !== undefined && pageSize !== null) {
    searchParams.set('pageSize', String(pageSize));
  }

  const payload = await apiRequest(`/announcements?${searchParams.toString()}`, {
    ...options,
    method: 'GET',
  });
  return payload.data;
}

/**
 * Create a new announcement as an authenticated ACTIVE ADMIN.
 *
 * @param {{ title: string, body: string, category: string, status?: 'DRAFT' | 'PUBLISHED', expiresAt?: string | null }} input
 * @param {RequestInit} [options]
 */
export async function createAnnouncement(input, options = {}) {
  const payload = await apiRequest('/announcements', {
    ...options,
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.data.announcement;
}

/**
 * Edit content, publish a draft, or archive an announcement (ACTIVE ADMIN only).
 *
 * @param {string} announcementId
 * @param {object} patch
 * @param {RequestInit} [options]
 */
export async function updateAnnouncement(announcementId, patch, options = {}) {
  const payload = await apiRequest(`/announcements/${encodeURIComponent(String(announcementId))}`, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return payload.data.announcement;
}
