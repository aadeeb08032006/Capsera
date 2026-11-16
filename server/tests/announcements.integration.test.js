import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL_PREFIX = `cp05-it-${RUN_ID}-`;
const TEST_TITLE_PREFIX = `CP05-IT-${RUN_ID}-`;

const { runPgIntegration, TEST_DB_NAME } = vi.hoisted(() => {
  const testDbName = 'capsera_cp03_test';
  const enabled = process.env.RUN_PG_INTEGRATION === 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'capsera-cp05-integration-test-secret';

  if (enabled) {
    if (process.env.DATABASE_URL) {
      let parsed;
      try {
        parsed = new URL(process.env.DATABASE_URL);
      } catch {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL targeting capsera_cp03_test');
      }
      if (parsed.pathname !== `/${testDbName}`) {
        throw new Error(
          `Refusing to run integration tests: DATABASE_URL must target /${testDbName}, got ${parsed.pathname}`,
        );
      }
    } else if (process.env.DB_NAME !== testDbName) {
      throw new Error(
        `Refusing to run integration tests: DB_NAME must be explicitly set to "${testDbName}"`,
      );
    }

    process.env.DB_HOST = process.env.INTEGRATION_DB_HOST || process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.INTEGRATION_DB_PORT || process.env.DB_PORT || '5432';
    process.env.DB_USER =
      process.env.INTEGRATION_DB_USER ||
      process.env.DB_USER ||
      process.env.PGUSER ||
      process.env.USER ||
      'postgres';
    process.env.DB_PASSWORD =
      process.env.INTEGRATION_DB_PASSWORD ?? process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '';
  }

  return { runPgIntegration: enabled, TEST_DB_NAME: testDbName };
});

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery, pool } from '../src/config/db.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

describe.runIf(runPgIntegration)(
  'CP-05 Announcements Real PostgreSQL Integration (capsera_cp03_test)',
  () => {
    const createdUserIds = [];
    const createdAnnouncementIds = [];
    let adminUser;
    let traineeUser;

    async function seedTestUser({ fullName, emailSlug, role, status = 'ACTIVE' }) {
      const email = `${TEST_EMAIL_PREFIX}${emailSlug}@capsera.test`;
      const result = await executeQuery(
        `INSERT INTO users (full_name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, full_name AS "fullName", email, role, status`,
        [fullName, email, '$2b$12$test.hash.placeholder.for.integration.only', role, status],
      );
      const id = String(result.rows[0].id);
      createdUserIds.push(id);
      return { ...result.rows[0], id };
    }

    async function createAnnouncementViaApi(adminToken, body) {
      const res = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body);
      if (res.status === 201 && res.body?.data?.announcement?.id) {
        createdAnnouncementIds.push(String(res.body.data.announcement.id));
      }
      return res;
    }

    async function insertRawAnnouncement({
      creatorId,
      title,
      body = 'Seeded test announcement body',
      category = 'ANNOUNCEMENT',
      status = 'PUBLISHED',
      publishedAtSql = 'NOW()',
      expiresAtSql = 'NULL',
    }) {
      const result = await executeQuery(
        `INSERT INTO announcements (creator_id, title, body, category, status, published_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, ${publishedAtSql}, ${expiresAtSql})
         RETURNING id`,
        [creatorId, title, body, category, status],
      );
      const id = String(result.rows[0].id);
      createdAnnouncementIds.push(id);
      return id;
    }

    async function cleanupTestRecords() {
      if (createdAnnouncementIds.length > 0) {
        await executeQuery('DELETE FROM announcements WHERE id = ANY($1::bigint[])', [
          createdAnnouncementIds,
        ]);
      }
      if (createdUserIds.length > 0) {
        await executeQuery('DELETE FROM users WHERE id = ANY($1::bigint[])', [createdUserIds]);
      }
      createdAnnouncementIds.length = 0;
      createdUserIds.length = 0;
    }

    beforeAll(async () => {
      const dbCheck = await executeQuery('SELECT current_database() AS db');
      if (dbCheck.rows[0]?.db !== TEST_DB_NAME) {
        throw new Error(
          `Refusing to run integration tests against non-isolated database: ${dbCheck.rows[0]?.db}`,
        );
      }
    });

    beforeEach(async () => {
      await cleanupTestRecords();
      adminUser = await seedTestUser({
        fullName: 'CP05 Integration Admin',
        emailSlug: 'admin',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      traineeUser = await seedTestUser({
        fullName: 'CP05 Integration Trainee',
        emailSlug: 'trainee',
        role: 'TRAINEE',
        status: 'ACTIVE',
      });
    });

    afterEach(async () => {
      await cleanupTestRecords();
    });

    afterAll(async () => {
      await pool.end();
    });

    it('supports DRAFT creation, publishing with published_at, public visibility filtering, and ARCHIVED removal', async () => {
      const adminToken = makeToken(adminUser.id);

      // 1. Admin creates a DRAFT announcement
      const draftRes = await createAnnouncementViaApi(adminToken, {
        title: `${TEST_TITLE_PREFIX}Draft-Only`,
        body: 'Visible only in admin scope until published.',
        category: 'ANNOUNCEMENT',
      });
      expect(draftRes.status).toBe(201);
      expect(draftRes.body.data.announcement.status).toBe('DRAFT');
      expect(draftRes.body.data.announcement.publishedAt).toBeNull();
      const draftId = draftRes.body.data.announcement.id;

      // 2. Admin creates a second draft and publishes it via PATCH
      const publishTargetRes = await createAnnouncementViaApi(adminToken, {
        title: `${TEST_TITLE_PREFIX}Published-Post`,
        body: 'Will be published now.',
        category: 'ACHIEVEMENT',
      });
      expect(publishTargetRes.status).toBe(201);
      const publishedId = publishTargetRes.body.data.announcement.id;

      const publishedRes = await request(app)
        .patch(`/api/v1/announcements/${publishedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED', title: `${TEST_TITLE_PREFIX}Published-Edited` });

      expect(publishedRes.status).toBe(200);
      expect(publishedRes.body.data.announcement.status).toBe('PUBLISHED');
      expect(publishedRes.body.data.announcement.publishedAt).toBeTruthy();

      const dbPublishedRow = await executeQuery(
        'SELECT status, published_at FROM announcements WHERE id = $1',
        [publishedId],
      );
      expect(dbPublishedRow.rows[0].status).toBe('PUBLISHED');
      expect(dbPublishedRow.rows[0].published_at).toBeTruthy();

      // 3. Seed expired and future-dated published rows (plus an archived row) directly
      const expiredId = await insertRawAnnouncement({
        creatorId: adminUser.id,
        title: `${TEST_TITLE_PREFIX}Expired-Post`,
        publishedAtSql: "NOW() - INTERVAL '2 hours'",
        expiresAtSql: "NOW() - INTERVAL '1 hour'",
      });
      const futureId = await insertRawAnnouncement({
        creatorId: adminUser.id,
        title: `${TEST_TITLE_PREFIX}Future-Post`,
        publishedAtSql: "NOW() + INTERVAL '2 hours'",
        expiresAtSql: 'NULL',
      });
      const archivedSeedRes = await createAnnouncementViaApi(adminToken, {
        title: `${TEST_TITLE_PREFIX}Archived-Seed`,
        body: 'Created then archived.',
        category: 'NEW_CONTENT',
        status: 'PUBLISHED',
      });
      const archivedId = archivedSeedRes.body.data.announcement.id;
      const archiveInitRes = await request(app)
        .patch(`/api/v1/announcements/${archivedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ARCHIVED' });
      expect(archiveInitRes.status).toBe(200);

      // 4. Public GET returns only the active published row and excludes draft, archived, expired, future
      const publicRes = await request(app).get('/api/v1/announcements?page=1&pageSize=100');
      expect(publicRes.status).toBe(200);
      const returnedIds = publicRes.body.data.items.map((item) => item.id);
      expect(returnedIds).toContain(publishedId);
      expect(returnedIds).not.toContain(draftId);
      expect(returnedIds).not.toContain(archivedId);
      expect(returnedIds).not.toContain(expiredId);
      expect(returnedIds).not.toContain(futureId);

      // 5. Archiving the published announcement removes it from public feed
      const archivePublishedRes = await request(app)
        .patch(`/api/v1/announcements/${publishedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ARCHIVED' });
      expect(archivePublishedRes.status).toBe(200);
      expect(archivePublishedRes.body.data.announcement.status).toBe('ARCHIVED');

      const publicAfterArchiveRes = await request(app).get('/api/v1/announcements?page=1&pageSize=100');
      expect(publicAfterArchiveRes.status).toBe(200);
      expect(publicAfterArchiveRes.body.data.items.map((item) => item.id)).not.toContain(
        publishedId,
      );
    });

    it('enforces authorization guards, invalid input/transition errors, old-draft expiry safety, and 404 handling', async () => {
      const adminToken = makeToken(adminUser.id);
      const traineeToken = makeToken(traineeUser.id);

      // Invalid Authorization header must not fall through cleanly or leak admin data
      const badHeaderPublic = await request(app)
        .get('/api/v1/announcements')
        .set('Authorization', 'Bearer corrupted-token');
      expect(badHeaderPublic.status).toBe(401);

      const badHeaderAdmin = await request(app)
        .get('/api/v1/announcements?scope=admin')
        .set('Authorization', 'Bearer corrupted-token');
      expect(badHeaderAdmin.status).toBe(401);

      const traineeAdminScope = await request(app)
        .get('/api/v1/announcements?scope=admin')
        .set('Authorization', `Bearer ${traineeToken}`);
      expect(traineeAdminScope.status).toBe(403);
      expect(traineeAdminScope.body.error.code).toBe('FORBIDDEN');

      const traineePost = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${traineeToken}`)
        .send({ title: 'No', body: 'No', category: 'ANNOUNCEMENT' });
      expect(traineePost.status).toBe(403);

      // Invalid category / status / expiry combinations
      const badCategory = await createAnnouncementViaApi(adminToken, {
        title: `${TEST_TITLE_PREFIX}BadCat`,
        body: 'Invalid category',
        category: 'INVALID_CAT',
      });
      expect(badCategory.status).toBe(400);
      expect(badCategory.body.error.code).toBe('VALIDATION_ERROR');

      const badExpiredPublish = await createAnnouncementViaApi(adminToken, {
        title: `${TEST_TITLE_PREFIX}PastExpiry`,
        body: 'Expires in past',
        category: 'ANNOUNCEMENT',
        status: 'PUBLISHED',
        expiresAt: '2020-01-01T00:00:00.000Z',
      });
      expect(badExpiredPublish.status).toBe(400);

      // Create an old draft with an already-past expiresAt, then verify publishing fails safely (400, not 500)
      const oldDraftRes = await createAnnouncementViaApi(adminToken, {
        title: `${TEST_TITLE_PREFIX}OldExpiredDraft`,
        body: 'Old draft body',
        category: 'ANNOUNCEMENT',
        status: 'DRAFT',
        expiresAt: '2020-01-01T00:00:00.000Z',
      });
      expect(oldDraftRes.status).toBe(201);
      const oldDraftId = oldDraftRes.body.data.announcement.id;

      const publishExpiredDraftRes = await request(app)
        .patch(`/api/v1/announcements/${oldDraftId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED' });
      expect(publishExpiredDraftRes.status).toBe(400);
      expect(publishExpiredDraftRes.body.error.code).toBe('VALIDATION_ERROR');

      // Archiving that draft succeeds and becomes terminal
      const archiveOldDraftRes = await request(app)
        .patch(`/api/v1/announcements/${oldDraftId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ARCHIVED' });
      expect(archiveOldDraftRes.status).toBe(200);

      const editArchivedRes = await request(app)
        .patch(`/api/v1/announcements/${oldDraftId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PUBLISHED' });
      expect(editArchivedRes.status).toBe(409);
      expect(editArchivedRes.body.error.code).toBe('CONFLICT');

      // Unknown ID returns 404
      const missingRes = await request(app)
        .patch('/api/v1/announcements/999999999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Does not exist' });
      expect(missingRes.status).toBe(404);
      expect(missingRes.body.error.code).toBe('ANNOUNCEMENT_NOT_FOUND');
    });

    it('paginates public and admin announcements accurately against real PostgreSQL', async () => {
      const adminToken = makeToken(adminUser.id);
      const baselinePublic = Number(
        (
          await executeQuery(
            `SELECT COUNT(*)::int AS count
             FROM announcements
             WHERE status = 'PUBLISHED'
               AND published_at IS NOT NULL
               AND published_at <= NOW()
               AND (expires_at IS NULL OR expires_at > NOW())`,
          )
        ).rows[0].count,
      );
      const baselineAll = Number(
        (await executeQuery('SELECT COUNT(*)::int AS count FROM announcements')).rows[0].count,
      );

      // Insert 3 active published announcements with distinct timestamps + 1 draft + 1 archived
      const p1 = await insertRawAnnouncement({
        creatorId: adminUser.id,
        title: `${TEST_TITLE_PREFIX}Page-Oldest`,
        category: 'NEW_CONTENT',
        publishedAtSql: "NOW() - INTERVAL '3 minutes'",
      });
      const p2 = await insertRawAnnouncement({
        creatorId: adminUser.id,
        title: `${TEST_TITLE_PREFIX}Page-Middle`,
        category: 'ACHIEVEMENT',
        publishedAtSql: "NOW() - INTERVAL '2 minutes'",
      });
      const p3 = await insertRawAnnouncement({
        creatorId: adminUser.id,
        title: `${TEST_TITLE_PREFIX}Page-Newest`,
        category: 'NEW_CONTENT',
        publishedAtSql: "NOW() - INTERVAL '1 minute'",
      });
      const d1 = await insertRawAnnouncement({
        creatorId: adminUser.id,
        title: `${TEST_TITLE_PREFIX}Page-Draft`,
        status: 'DRAFT',
        publishedAtSql: 'NULL',
      });
      const a1 = await insertRawAnnouncement({
        creatorId: adminUser.id,
        title: `${TEST_TITLE_PREFIX}Page-Archived`,
        status: 'ARCHIVED',
        publishedAtSql: "NOW() - INTERVAL '4 minutes'",
      });

      const pubPage1 = await request(app).get('/api/v1/announcements?page=1&pageSize=2');
      const pubPage2 = await request(app).get('/api/v1/announcements?page=2&pageSize=2');

      expect(pubPage1.status).toBe(200);
      expect(pubPage1.body.data.pagination.totalItems).toBe(baselinePublic + 3);
      expect(pubPage1.body.data.items).toHaveLength(2);
      // Seeded with recent timestamps, so p3 and p2 appear first when baseline is older or empty
      expect(pubPage1.body.data.items.map((item) => item.id).slice(0, 2)).toEqual([p3, p2]);
      expect(pubPage2.status).toBe(200);
      expect(pubPage2.body.data.items.map((item) => item.id)).toContain(p1);

      const adminAllPage = await request(app)
        .get('/api/v1/announcements?scope=admin&page=1&pageSize=2')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminAllPage.status).toBe(200);
      expect(adminAllPage.body.data.pagination.totalItems).toBe(baselineAll + 5);
      expect(adminAllPage.body.data.items).toHaveLength(2);

      const adminDrafts = await request(app)
        .get('/api/v1/announcements?scope=admin&status=DRAFT&page=1&pageSize=20')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminDrafts.status).toBe(200);
      expect(adminDrafts.body.data.items.map((item) => item.id)).toContain(d1);
      expect(adminDrafts.body.data.items.map((item) => item.id)).not.toContain(p1);
      expect(adminDrafts.body.data.items.map((item) => item.id)).not.toContain(a1);
    });

    it('enforces PostgreSQL foreign keys and CHECK constraints while cleanup preserves non-test rows', async () => {
      const initialTotal = Number(
        (await executeQuery('SELECT COUNT(*)::int AS count FROM announcements')).rows[0].count,
      );

      // Invalid creator FK rejected by fk_announcements_creator (23503)
      await expect(
        executeQuery(
          `INSERT INTO announcements (creator_id, title, body, category, status)
           VALUES ($1, $2, $3, 'ANNOUNCEMENT', 'DRAFT')`,
          ['999999999999', `${TEST_TITLE_PREFIX}NoCreator`, 'Body'],
        ),
      ).rejects.toMatchObject({ code: '23503' });

      // CHECK constraints enforce valid status/category/published_at/expiry_order (23514)
      await expect(
        executeQuery(
          `INSERT INTO announcements (creator_id, title, body, category, status)
           VALUES ($1, $2, $3, 'BAD_CATEGORY', 'DRAFT')`,
          [adminUser.id, `${TEST_TITLE_PREFIX}BadCatDB`, 'Body'],
        ),
      ).rejects.toMatchObject({ code: '23514' });

      await expect(
        executeQuery(
          `INSERT INTO announcements (creator_id, title, body, category, status, published_at)
           VALUES ($1, $2, $3, 'ANNOUNCEMENT', 'PUBLISHED', NULL)`,
          [adminUser.id, `${TEST_TITLE_PREFIX}NullPub`, 'Body'],
        ),
      ).rejects.toMatchObject({ code: '23514' });

      await expect(
        executeQuery(
          `INSERT INTO announcements (creator_id, title, body, category, status, published_at, expires_at)
           VALUES ($1, $2, $3, 'ANNOUNCEMENT', 'PUBLISHED', NOW(), NOW() - INTERVAL '1 minute')`,
          [adminUser.id, `${TEST_TITLE_PREFIX}BadExpiryOrder`, 'Body'],
        ),
      ).rejects.toMatchObject({ code: '23514' });

      // Valid row created then deleted via cleanupTestRecords leaves baseline unchanged
      await insertRawAnnouncement({
        creatorId: adminUser.id,
        title: `${TEST_TITLE_PREFIX}Cleanup-Target`,
        status: 'DRAFT',
        publishedAtSql: 'NULL',
      });

      // Deleting the creator while an announcement references it fails due to ON DELETE RESTRICT (23001)
      await expect(
        executeQuery('DELETE FROM users WHERE id = $1', [adminUser.id]),
      ).rejects.toMatchObject({ code: '23001' });

      await cleanupTestRecords();

      const afterCleanupTotal = Number(
        (await executeQuery('SELECT COUNT(*)::int AS count FROM announcements')).rows[0].count,
      );
      expect(afterCleanupTotal).toBe(initialTotal);
    });
  },
);