import { executeQuery } from '../../config/db.js';
import { PAGINATION_DEFAULTS } from '../../shared/constants.js';
import { ANNOUNCEMENT_STATUSES } from './announcements.validation.js';

const ANNOUNCEMENT_COLUMNS = `
  a.id,
  a.creator_id AS "creatorId",
  u.full_name AS "creatorName",
  a.title,
  a.body,
  a.category,
  a.status,
  a.published_at AS "publishedAt",
  a.expires_at AS "expiresAt",
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt"
`;

/**
 * Fetch public homepage announcements: only PUBLISHED, already published, and not expired.
 */
export async function findPublicAnnouncements({
  category,
  limit = PAGINATION_DEFAULTS.PAGE_SIZE,
  offset = 0,
}) {
  const conditions = [
    'a.status = $1',
    'a.published_at IS NOT NULL',
    'a.published_at <= NOW()',
    '(a.expires_at IS NULL OR a.expires_at > NOW())',
  ];
  const params = [ANNOUNCEMENT_STATUSES.PUBLISHED];

  if (category) {
    params.push(category);
    conditions.push(`a.category = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await executeQuery(
    `SELECT COUNT(*)::int AS "totalItems"
     FROM announcements a
     WHERE ${whereClause}`,
    params,
  );

  const totalItems = Number(countResult?.rows?.[0]?.totalItems ?? 0);
  if (totalItems === 0) {
    return { items: [], totalItems: 0 };
  }

  const rowsResult = await executeQuery(
    `SELECT ${ANNOUNCEMENT_COLUMNS}
     FROM announcements a
     LEFT JOIN users u ON u.id = a.creator_id
     WHERE ${whereClause}
     ORDER BY a.published_at DESC, a.id DESC
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return {
    items: rowsResult?.rows ?? [],
    totalItems,
  };
}

/**
 * Fetch all announcements for Admin oversight, with optional status and category filters.
 */
export async function findAdminAnnouncements({
  category,
  status,
  limit = PAGINATION_DEFAULTS.PAGE_SIZE,
  offset = 0,
}) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`a.category = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await executeQuery(
    `SELECT COUNT(*)::int AS "totalItems"
     FROM announcements a
     ${whereClause}`,
    params,
  );

  const totalItems = Number(countResult?.rows?.[0]?.totalItems ?? 0);
  if (totalItems === 0) {
    return { items: [], totalItems: 0 };
  }

  const rowsResult = await executeQuery(
    `SELECT ${ANNOUNCEMENT_COLUMNS}
     FROM announcements a
     LEFT JOIN users u ON u.id = a.creator_id
     ${whereClause}
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return {
    items: rowsResult?.rows ?? [],
    totalItems,
  };
}

/**
 * Insert a new announcement row and return it with creator metadata.
 */
export async function insertAnnouncement({
  creatorId,
  title,
  body,
  category,
  status,
  publishedAt,
  expiresAt,
}) {
  const result = await executeQuery(
    `WITH inserted AS (
       INSERT INTO announcements (creator_id, title, body, category, status, published_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *
     )
     SELECT
       a.id,
       a.creator_id AS "creatorId",
       u.full_name AS "creatorName",
       a.title,
       a.body,
       a.category,
       a.status,
       a.published_at AS "publishedAt",
       a.expires_at AS "expiresAt",
       a.created_at AS "createdAt",
       a.updated_at AS "updatedAt"
     FROM inserted a
     LEFT JOIN users u ON u.id = a.creator_id`,
    [creatorId, title, body, category, status, publishedAt, expiresAt],
  );

  return result?.rows?.[0] ?? null;
}

/**
 * Lock an announcement row inside an active transaction prior to update.
 */
export async function findAnnouncementByIdForUpdate(client, announcementId) {
  const result = await client.query(
    `SELECT
       id,
       creator_id AS "creatorId",
       title,
       body,
       category,
       status,
       published_at AS "publishedAt",
       expires_at AS "expiresAt",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM announcements
     WHERE id = $1
     FOR UPDATE`,
    [announcementId],
  );

  return result?.rows?.[0] ?? null;
}

/**
 * Update an announcement row inside an active transaction and return updated DTO fields.
 */
export async function updateAnnouncementById(
  client,
  announcementId,
  { title, body, category, status, publishedAt, expiresAt },
) {
  const result = await client.query(
    `WITH updated AS (
       UPDATE announcements
       SET
         title = $2,
         body = $3,
         category = $4,
         status = $5,
         published_at = $6,
         expires_at = $7,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *
     )
     SELECT
       a.id,
       a.creator_id AS "creatorId",
       u.full_name AS "creatorName",
       a.title,
       a.body,
       a.category,
       a.status,
       a.published_at AS "publishedAt",
       a.expires_at AS "expiresAt",
       a.created_at AS "createdAt",
       a.updated_at AS "updatedAt"
     FROM updated a
     LEFT JOIN users u ON u.id = a.creator_id`,
    [announcementId, title, body, category, status, publishedAt, expiresAt],
  );

  return result?.rows?.[0] ?? null;
}
