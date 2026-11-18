import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL_PREFIX = `m4-qa-${RUN_ID}-`;
const TEST_TITLE_PREFIX = `M4-QA-${RUN_ID}-`;

const { runPgIntegration, TEST_DB_NAME } = vi.hoisted(() => {
  const testDbName = 'capsera_cp03_test';
  const enabled = process.env.RUN_PG_INTEGRATION === 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'capsera-m4-qa-integration-test-secret';

  if (enabled) {
    if (process.env.DATABASE_URL) {
      const parsed = new URL(process.env.DATABASE_URL);
      if (parsed.pathname !== `/${testDbName}`) {
        throw new Error(`DATABASE_URL must target /${testDbName}, got ${parsed.pathname}`);
      }
    } else if (process.env.DB_NAME !== testDbName) {
      throw new Error(`DB_NAME must be "${testDbName}"`);
    }

    process.env.DB_HOST = process.env.INTEGRATION_DB_HOST || process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.INTEGRATION_DB_PORT || process.env.DB_PORT || '5432';
    process.env.DB_USER =
      process.env.INTEGRATION_DB_USER || process.env.DB_USER || process.env.USER || 'postgres';
    process.env.DB_PASSWORD =
      process.env.INTEGRATION_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '';
  }

  return { runPgIntegration: enabled, TEST_DB_NAME: testDbName };
});

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery, pool } from '../src/config/db.js';
import { issueCertificateIfEligible } from '../src/modules/certificates/certificates.service.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

describe.runIf(runPgIntegration)('Member 4 Comprehensive QA Suite (capsera_cp03_test)', () => {
  const createdUserIds = [];
  const createdSkillIds = [];
  const createdAnnouncementIds = [];
  const createdCourseIds = [];
  const createdLessonIds = [];
  const createdEnrollmentIds = [];
  const createdCertificateIds = [];

  async function seedUser({ fullName, emailSlug, role, status = 'ACTIVE' }) {
    const email = `${TEST_EMAIL_PREFIX}${emailSlug}@capsera.test`;
    const result = await executeQuery(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ($1, $2, '$2b$12$test.hash.placeholder.for.integration.only', $3, $4)
       RETURNING id, full_name AS "fullName", email, role, status`,
      [fullName, email, role, status],
    );
    const id = String(result.rows[0].id);
    createdUserIds.push(id);
    return { ...result.rows[0], id };
  }

  async function cleanupTestRecords() {
    if (
      createdCertificateIds.length > 0 ||
      createdUserIds.length > 0 ||
      createdCourseIds.length > 0
    ) {
      await executeQuery(
        `DELETE FROM audit_logs
         WHERE target_entity = 'certificates'
           AND target_id IN (
             SELECT id
             FROM certificates
             WHERE id = ANY($1::bigint[])
                OR trainee_id = ANY($2::bigint[])
                OR course_id = ANY($3::bigint[])
           )`,
        [createdCertificateIds, createdUserIds, createdCourseIds],
      );
      await executeQuery(
        `DELETE FROM certificates
         WHERE id = ANY($1::bigint[])
            OR trainee_id = ANY($2::bigint[])
            OR course_id = ANY($3::bigint[])`,
        [createdCertificateIds, createdUserIds, createdCourseIds],
      );
    }

    if (createdEnrollmentIds.length > 0) {
      await executeQuery('DELETE FROM lesson_progress WHERE enrollment_id = ANY($1::bigint[])', [
        createdEnrollmentIds,
      ]);
      await executeQuery('DELETE FROM enrollments WHERE id = ANY($1::bigint[])', [
        createdEnrollmentIds,
      ]);
    }
    if (createdLessonIds.length > 0) {
      await executeQuery('DELETE FROM lessons WHERE id = ANY($1::bigint[])', [createdLessonIds]);
    }
    if (createdCourseIds.length > 0) {
      await executeQuery('DELETE FROM courses WHERE id = ANY($1::bigint[])', [createdCourseIds]);
    }
    if (createdAnnouncementIds.length > 0) {
      await executeQuery('DELETE FROM announcements WHERE id = ANY($1::bigint[])', [
        createdAnnouncementIds,
      ]);
    }
    if (createdUserIds.length > 0) {
      await executeQuery('DELETE FROM trainer_skills WHERE trainer_id = ANY($1::bigint[])', [
        createdUserIds,
      ]);
      await executeQuery('DELETE FROM trainee_skills WHERE trainee_id = ANY($1::bigint[])', [
        createdUserIds,
      ]);
    }
    if (createdSkillIds.length > 0) {
      await executeQuery('DELETE FROM skills WHERE id = ANY($1::bigint[])', [createdSkillIds]);
    }
    if (createdUserIds.length > 0) {
      await executeQuery('DELETE FROM users WHERE id = ANY($1::bigint[])', [createdUserIds]);
    }

    createdCertificateIds.length = 0;
    createdEnrollmentIds.length = 0;
    createdLessonIds.length = 0;
    createdCourseIds.length = 0;
    createdAnnouncementIds.length = 0;
    createdSkillIds.length = 0;
    createdUserIds.length = 0;
  }

  beforeAll(async () => {
    const dbCheck = await executeQuery('SELECT current_database() AS db');
    if (dbCheck.rows[0]?.db !== TEST_DB_NAME) {
      throw new Error(`Refusing to run against non-isolated DB: ${dbCheck.rows[0]?.db}`);
    }
  });

  afterEach(async () => {
    await cleanupTestRecords();
  });

  afterAll(async () => {
    await cleanupTestRecords();
    await pool.end();
  });

  it('QA-API-01: enforces skill catalogue validation, trimming, RBAC, and pagination boundaries', async () => {
    const admin = await seedUser({ fullName: 'QA Admin', emailSlug: 'admin1', role: 'ADMIN' });
    const trainee = await seedUser({
      fullName: 'QA Trainee',
      emailSlug: 'trainee1',
      role: 'TRAINEE',
    });
    const pendingAdmin = await seedUser({
      fullName: 'QA Pending',
      emailSlug: 'pending1',
      role: 'ADMIN',
      status: 'PENDING',
    });

    const adminToken = makeToken(admin.id);
    const traineeToken = makeToken(trainee.id);
    const pendingToken = makeToken(pendingAdmin.id);

    // Non-admin & pending blocked on POST /skills
    const traineePost = await request(app)
      .post('/api/v1/skills')
      .set('Authorization', `Bearer ${traineeToken}`)
      .send({ name: `${TEST_TITLE_PREFIX}Denied`, category: 'QA' });
    expect(traineePost.status).toBe(403);

    const pendingGet = await request(app)
      .get('/api/v1/skills')
      .set('Authorization', `Bearer ${pendingToken}`);
    expect(pendingGet.status).toBe(403);

    // Whitespace trimming & persistence
    const createdRes = await request(app)
      .post('/api/v1/skills')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `  ${TEST_TITLE_PREFIX}Docker  `, category: '  DevOps  ' });
    expect(createdRes.status).toBe(201);
    createdSkillIds.push(String(createdRes.body.data.skill.id));
    expect(createdRes.body.data.skill.name).toBe(`${TEST_TITLE_PREFIX}Docker`);
    expect(createdRes.body.data.skill.category).toBe('DevOps');

    // Invalid pagination rejected
    const badPage = await request(app)
      .get('/api/v1/skills?page=0&pageSize=101')
      .set('Authorization', `Bearer ${traineeToken}`);
    expect(badPage.status).toBe(400);
    expect(badPage.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('QA-API-02: enforces trainee & trainer skill mapping validation, strict schemas, and cross-role isolation', async () => {
    const admin = await seedUser({ fullName: 'QA Admin', emailSlug: 'admin2', role: 'ADMIN' });
    const trainee = await seedUser({
      fullName: 'QA Trainee',
      emailSlug: 'trainee2',
      role: 'TRAINEE',
    });
    const trainer = await seedUser({
      fullName: 'QA Trainer',
      emailSlug: 'trainer2',
      role: 'TRAINER',
    });

    const skillRes = await request(app)
      .post('/api/v1/skills')
      .set('Authorization', `Bearer ${makeToken(admin.id)}`)
      .send({ name: `${TEST_TITLE_PREFIX}Kubernetes`, category: 'Cloud' });
    const skillId = String(skillRes.body.data.skill.id);
    createdSkillIds.push(skillId);

    const traineeToken = makeToken(trainee.id);
    const trainerToken = makeToken(trainer.id);

    // Cross-role rejection
    expect(
      (
        await request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${trainerToken}`)
          .send({ skills: [{ skillId, proficiency: 3 }] })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .put('/api/v1/profiles/me/trainer-skills')
          .set('Authorization', `Bearer ${traineeToken}`)
          .send({ skills: [{ skillId, proficiency: 3, yearsOfExperience: 2 }] })
      ).status,
    ).toBe(403);

    // Precision & boundary checks on trainer yearsOfExperience
    const badPrecision = await request(app)
      .put('/api/v1/profiles/me/trainer-skills')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({ skills: [{ skillId, proficiency: 3, yearsOfExperience: 2.25 }] });
    expect(badPrecision.status).toBe(400);

    const badProficiency = await request(app)
      .put('/api/v1/profiles/me/skills')
      .set('Authorization', `Bearer ${traineeToken}`)
      .send({ skills: [{ skillId, proficiency: 5 }] });
    expect(badProficiency.status).toBe(400);
  });

  it('QA-API-03: enforces recommendations RBAC, deterministic tie-breakers, and invalid skillId rejection', async () => {
    const admin = await seedUser({ fullName: 'QA Admin', emailSlug: 'admin3', role: 'ADMIN' });
    const trainee = await seedUser({
      fullName: 'QA Trainee',
      emailSlug: 'trainee3',
      role: 'TRAINEE',
    });
    const trainerA = await seedUser({ fullName: 'Alpha Trainer', emailSlug: 'ta', role: 'TRAINER' });
    const trainerB = await seedUser({ fullName: 'Beta Trainer', emailSlug: 'tb', role: 'TRAINER' });

    const skillRes = await request(app)
      .post('/api/v1/skills')
      .set('Authorization', `Bearer ${makeToken(admin.id)}`)
      .send({ name: `${TEST_TITLE_PREFIX}Python`, category: 'Programming' });
    const skillId = String(skillRes.body.data.skill.id);
    createdSkillIds.push(skillId);

    // Same proficiency & experience -> tie-break by LOWER(full_name) ASC
    await request(app)
      .put('/api/v1/profiles/me/trainer-skills')
      .set('Authorization', `Bearer ${makeToken(trainerB.id)}`)
      .send({ skills: [{ skillId, proficiency: 4, yearsOfExperience: 5 }] });
    await request(app)
      .put('/api/v1/profiles/me/trainer-skills')
      .set('Authorization', `Bearer ${makeToken(trainerA.id)}`)
      .send({ skills: [{ skillId, proficiency: 4, yearsOfExperience: 5 }] });

    // TRAINER forbidden
    const trainerReq = await request(app)
      .get(`/api/v1/trainers/recommendations?skillId=${skillId}`)
      .set('Authorization', `Bearer ${makeToken(trainerA.id)}`);
    expect(trainerReq.status).toBe(403);

    // ADMIN allowed & deterministic tie-breaker verified
    const adminReq = await request(app)
      .get(`/api/v1/trainers/recommendations?skillId=${skillId}`)
      .set('Authorization', `Bearer ${makeToken(admin.id)}`);
    expect(adminReq.status).toBe(200);
    expect(adminReq.body.data.items.map((i) => i.trainerId)).toEqual([trainerA.id, trainerB.id]);

    // Invalid skillId rejected
    const badSkillId = await request(app)
      .get('/api/v1/trainers/recommendations?skillId=not-a-number')
      .set('Authorization', `Bearer ${makeToken(trainee.id)}`);
    expect(badSkillId.status).toBe(400);
  });

  it('QA-API-04: enforces announcement expiry filtering, status transitions, and role-based feed guards', async () => {
    const admin = await seedUser({ fullName: 'QA Admin', emailSlug: 'admin4', role: 'ADMIN' });
    const trainee = await seedUser({
      fullName: 'QA Trainee',
      emailSlug: 'trainee4',
      role: 'TRAINEE',
    });

    const adminToken = makeToken(admin.id);
    const traineeToken = makeToken(trainee.id);

    // Create DRAFT -> not visible publicly, visible in scope=admin
    const draftRes = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `${TEST_TITLE_PREFIX}Draft Notice`,
        body: 'Draft body',
        category: 'ANNOUNCEMENT',
        status: 'DRAFT',
      });
    expect(draftRes.status).toBe(201);
    const annId = String(draftRes.body.data.announcement.id);
    createdAnnouncementIds.push(annId);

    const publicWhileDraft = await request(app).get('/api/v1/announcements?pageSize=100');
    expect(publicWhileDraft.status).toBe(200);
    expect(publicWhileDraft.body.data.items.some((a) => String(a.id) === annId)).toBe(false);

    // Trainee blocked from scope=admin and POST
    expect(
      (
        await request(app)
          .get('/api/v1/announcements?scope=admin')
          .set('Authorization', `Bearer ${traineeToken}`)
      ).status,
    ).toBe(403);

    // Publish with past expiresAt rejected
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const pastPublish = await request(app)
      .patch(`/api/v1/announcements/${annId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PUBLISHED', expiresAt: pastIso });
    expect(pastPublish.status).toBe(400);

    // Publish valid, verify visible publicly & to authenticated trainee
    const futureIso = new Date(Date.now() + 3_600_000).toISOString();
    const publishedRes = await request(app)
      .patch(`/api/v1/announcements/${annId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PUBLISHED', expiresAt: futureIso });
    expect(publishedRes.status).toBe(200);

    const publicAfterPublish = await request(app)
      .get('/api/v1/announcements?pageSize=100')
      .set('Authorization', `Bearer ${traineeToken}`);
    expect(publicAfterPublish.status).toBe(200);
    expect(publicAfterPublish.body.data.items.some((a) => String(a.id) === annId)).toBe(true);

    // Archive -> terminal state rejects further edits
    const archivedRes = await request(app)
      .patch(`/api/v1/announcements/${annId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ARCHIVED' });
    expect(archivedRes.status).toBe(200);

    const editArchived = await request(app)
      .patch(`/api/v1/announcements/${annId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Should Fail' });
    expect(editArchived.status).toBe(409);
  });

  it('QA-API-05: verifies certificate RBAC, verification validation, audit payload, and dashboard access', async () => {
    const admin = await seedUser({ fullName: 'QA Admin', emailSlug: 'admin5', role: 'ADMIN' });
    const trainer = await seedUser({ fullName: 'QA Trainer', emailSlug: 'trainer5', role: 'TRAINER' });
    const trainee = await seedUser({ fullName: 'QA Trainee', emailSlug: 'trainee5', role: 'TRAINEE' });

    const courseRes = await executeQuery(
      `INSERT INTO courses (trainer_id, title, description, subject, level, status, published_at)
       VALUES ($1, $2, 'QA course', 'Testing', 'BEGINNER', 'PUBLISHED', NOW())
       RETURNING id`,
      [trainer.id, `${TEST_TITLE_PREFIX}CertCourse`],
    );
    const courseId = String(courseRes.rows[0].id);
    createdCourseIds.push(courseId);

    const lessonRes = await executeQuery(
      `INSERT INTO lessons (course_id, title, content, lesson_order)
       VALUES ($1, 'L1', 'Content', 1) RETURNING id`,
      [courseId],
    );
    const lessonId = String(lessonRes.rows[0].id);
    createdLessonIds.push(lessonId);

    const enrollRes = await executeQuery(
      `INSERT INTO enrollments (trainee_id, course_id, status)
       VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [trainee.id, courseId],
    );
    const enrollId = String(enrollRes.rows[0].id);
    createdEnrollmentIds.push(enrollId);

    await executeQuery(
      `INSERT INTO lesson_progress (enrollment_id, course_id, lesson_id) VALUES ($1, $2, $3)`,
      [enrollId, courseId, lessonId],
    );

    const issued = await issueCertificateIfEligible(trainee.id, courseId);
    expect(issued.issued).toBe(true);
    createdCertificateIds.push(String(issued.certificate.id));

    // Only TRAINEE can access /certificates/me
    expect(
      (
        await request(app)
          .get('/api/v1/certificates/me')
          .set('Authorization', `Bearer ${makeToken(trainer.id)}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/v1/certificates/me')
          .set('Authorization', `Bearer ${makeToken(admin.id)}`)
      ).status,
    ).toBe(403);

    // Invalid certificateCode format rejected with 400
    const badCode = await request(app).get('/api/v1/certificates/verify/bad$code!');
    expect(badCode.status).toBe(400);

    // Dashboard rejects non-admin & returns live counts to admin
    expect(
      (
        await request(app)
          .get('/api/v1/admin/dashboard/summary')
          .set('Authorization', `Bearer ${makeToken(trainee.id)}`)
      ).status,
    ).toBe(403);
    const dashSummary = await request(app)
      .get('/api/v1/admin/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken(admin.id)}`);
    expect(dashSummary.status).toBe(200);
    expect(dashSummary.body.data.certificates.totalIssued).toBeGreaterThanOrEqual(1);
  });
});
