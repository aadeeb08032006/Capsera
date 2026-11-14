import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { ROLES } from '../../shared/constants.js';
import {
  findAdminAnnouncements,
  findAnnouncementByIdForUpdate,
  findPublicAnnouncements,
  insertAnnouncement,
  updateAnnouncementById,
} from './announcements.repository.js';
import { ANNOUNCEMENT_STATUSES } from './announcements.validation.js';

function toIsoOrNull(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function formatAnnouncement(row) {
  return {
    id: String(row.id),
    creatorId: String(row.creatorId),
    creatorName: row.creatorName ?? null,
    title: row.title,
    body: row.body,
    category: row.category,
    status: row.status,
    publishedAt: toIsoOrNull(row.publishedAt),
    expiresAt: toIsoOrNull(row.expiresAt),
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  };
}

function assertValidExpiryWindow(publishedAt, expiresAt) {
  if (!expiresAt) return;
  const expiresMs = new Date(expiresAt).getTime();
  if (!publishedAt) return;
  const publishedMs = new Date(publishedAt).getTime();
  if (expiresMs <= publishedMs) {
    throw new AppError(400, 'VALIDATION_ERROR', 'expiresAt must be later than publishedAt');
  }
}

/**
 * List announcements for either the public homepage feed (`scope=public`)
 * or full Admin oversight (`scope=admin`).
 */
export async function listAnnouncements({ category, status, scope, page, pageSize }, user) {
  if (scope === 'admin') {
    if (!user || user.role !== ROLES.ADMIN) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions for admin announcements');
    }
  } else if (status !== undefined) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'status filtering is only permitted when scope=admin',
    );
  }

  const offset = (page - 1) * pageSize;

  try {
    const result =
      scope === 'admin'
        ? await findAdminAnnouncements({ category, status, limit: pageSize, offset })
        : await findPublicAnnouncements({ category, limit: pageSize, offset });

    return {
      items: result.items.map(formatAnnouncement),
      page,
      pageSize,
      totalItems: result.totalItems,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

/**
 * Create a new announcement as an authenticated ACTIVE ADMIN.
 */
export async function createAnnouncement(
  creatorId,
  { title, body, category, status = ANNOUNCEMENT_STATUSES.DRAFT, expiresAt = null },
) {
  const publishedAt = status === ANNOUNCEMENT_STATUSES.PUBLISHED ? new Date().toISOString() : null;
  assertValidExpiryWindow(publishedAt, expiresAt);

  try {
    const created = await insertAnnouncement({
      creatorId,
      title,
      body,
      category,
      status,
      publishedAt,
      expiresAt,
    });
    return formatAnnouncement(created);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

/**
 * Edit, publish, or archive an existing announcement inside a transaction.
 * Enforces `ARCHIVED` as a terminal state and rejects `PUBLISHED -> DRAFT`.
 */
export async function updateAnnouncement(announcementId, patch) {
  try {
    const updated = await withTransaction(async (client) => {
      const existing = await findAnnouncementByIdForUpdate(client, announcementId);
      if (!existing) {
        throw new AppError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
      }

      if (existing.status === ANNOUNCEMENT_STATUSES.ARCHIVED) {
        throw new AppError(
          409,
          'CONFLICT',
          'Archived announcements cannot be modified or restored',
        );
      }

      const nextStatus = patch.status ?? existing.status;
      if (
        existing.status === ANNOUNCEMENT_STATUSES.PUBLISHED &&
        nextStatus === ANNOUNCEMENT_STATUSES.DRAFT
      ) {
        throw new AppError(
          409,
          'CONFLICT',
          'Published announcements cannot be reverted to DRAFT; archive them instead',
        );
      }

      let nextPublishedAt = existing.publishedAt ? toIsoOrNull(existing.publishedAt) : null;
      if (
        existing.status === ANNOUNCEMENT_STATUSES.DRAFT &&
        nextStatus === ANNOUNCEMENT_STATUSES.PUBLISHED
      ) {
        nextPublishedAt = new Date().toISOString();
      }

      const nextExpiresAt =
        patch.expiresAt !== undefined
          ? patch.expiresAt
          : existing.expiresAt
            ? toIsoOrNull(existing.expiresAt)
            : null;

      assertValidExpiryWindow(nextPublishedAt, nextExpiresAt);

      return updateAnnouncementById(client, announcementId, {
        title: patch.title ?? existing.title,
        body: patch.body ?? existing.body,
        category: patch.category ?? existing.category,
        status: nextStatus,
        publishedAt: nextPublishedAt,
        expiresAt: nextExpiresAt,
      });
    });

    return formatAnnouncement(updated);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}