import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL_PREFIX = `cp03-it-${RUN_ID}-`;
const TEST_SKILL_PREFIX = `CP03-IT-${RUN_ID}-`;

const { runPgIntegration, TEST_DB_NAME } = vi.hoisted(() => {
  const testDbName = 'capsera_cp03_test';
  const enabled = process.env.RUN_PG_INTEGRATION === 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'capsera-cp03-integration-test-secret';

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
  'CP-03 Competency Real PostgreSQL Integration (capsera_cp03_test)',
  () => {
    const createdUserIds = [];
    const createdSkillIds = [];
    let adminUser;
    let traineeUser;
    let trainerUser;
    let pendingUser;

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

    async function createTestSkill(adminToken, { name, category }) {
      const res = await request(app)
        .post('/api/v1/skills')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, category });
      if (res.status === 201 && res.body?.data?.skill?.id) {
        createdSkillIds.push(String(res.body.data.skill.id));
      }
      return res;
    }

    async function cleanupTestRecords() {
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
      createdUserIds.length = 0;
      createdSkillIds.length = 0;
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
        fullName: 'Integration Admin',
        emailSlug: 'admin',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      traineeUser = await seedTestUser({
        fullName: 'Integration Trainee',
        emailSlug: 'trainee',
        role: 'TRAINEE',
        status: 'ACTIVE',
      });
      trainerUser = await seedTestUser({
        fullName: 'Integration Trainer',
        emailSlug: 'trainer',
        role: 'TRAINER',
        status: 'ACTIVE',
      });
      pendingUser = await seedTestUser({
        fullName: 'Integration Pending',
        emailSlug: 'pending',
        role: 'TRAINEE',
        status: 'PENDING',
      });
    });

    afterEach(async () => {
      await cleanupTestRecords();
    });

    afterAll(async () => {
      await pool.end();
    });

    describe('Skills Catalogue (POST /api/v1/skills & GET /api/v1/skills)', () => {
      it('creates skills, enforces case-insensitive uniqueness (uq_skills_name_ci), and handles concurrent duplicates', async () => {
        const adminToken = makeToken(adminUser.id);
        const nodeName = `${TEST_SKILL_PREFIX}Node.js`;
        const pythonName = `${TEST_SKILL_PREFIX}Python`;

        const createRes = await createTestSkill(adminToken, {
          name: `  ${nodeName}  `,
          category: '  Backend  ',
        });

        expect(createRes.status).toBe(201);
        expect(createRes.body.success).toBe(true);
        expect(createRes.body.data.skill).toMatchObject({
          name: nodeName,
          category: 'Backend',
        });
        expect(typeof createRes.body.data.skill.id).toBe('string');
        expect(Number.isNaN(Date.parse(createRes.body.data.skill.createdAt))).toBe(false);

        const dupRes = await createTestSkill(adminToken, {
          name: nodeName.toLowerCase(),
          category: 'Runtime',
        });

        expect(dupRes.status).toBe(409);
        expect(dupRes.body.error.code).toBe('CONFLICT');

        const [raceA, raceB] = await Promise.all([
          createTestSkill(adminToken, { name: pythonName, category: 'Backend' }),
          createTestSkill(adminToken, { name: pythonName.toLowerCase(), category: 'Backend' }),
        ]);

        const statuses = [raceA.status, raceB.status].sort((a, b) => a - b);
        expect(statuses).toEqual([201, 409]);
      });

      it('filters by exact category, orders deterministically, and paginates results', async () => {
        const adminToken = makeToken(adminUser.id);
        const traineeToken = makeToken(traineeUser.id);
        const backendCategory = `${TEST_SKILL_PREFIX}Backend`;

        const seedList = [
          { name: `${TEST_SKILL_PREFIX}zeta-db`, category: `${TEST_SKILL_PREFIX}Databases` },
          { name: `${TEST_SKILL_PREFIX}Alpha-API`, category: backendCategory },
          { name: `${TEST_SKILL_PREFIX}express`, category: backendCategory },
          { name: `${TEST_SKILL_PREFIX}Node.js`, category: backendCategory },
          { name: `${TEST_SKILL_PREFIX}Docker`, category: `${TEST_SKILL_PREFIX}DevOps` },
        ];
        for (const item of seedList) {
          const res = await createTestSkill(adminToken, item);
          expect(res.status).toBe(201);
        }

        const pendingRes = await request(app)
          .get('/api/v1/skills')
          .set('Authorization', `Bearer ${makeToken(pendingUser.id)}`);
        expect(pendingRes.status).toBe(403);
        expect(pendingRes.body.error.code).toBe('ACCOUNT_PENDING');

        const page1 = await request(app)
          .get(`/api/v1/skills?category=${encodeURIComponent(backendCategory)}&page=1&pageSize=2`)
          .set('Authorization', `Bearer ${traineeToken}`);

        expect(page1.status).toBe(200);
        expect(page1.body.data.items.map((s) => s.name)).toEqual([
          `${TEST_SKILL_PREFIX}Alpha-API`,
          `${TEST_SKILL_PREFIX}express`,
        ]);
        expect(page1.body.data.pagination).toEqual({
          page: 1,
          pageSize: 2,
          totalItems: 3,
          totalPages: 2,
        });

        const page2 = await request(app)
          .get(`/api/v1/skills?category=${encodeURIComponent(backendCategory)}&page=2&pageSize=2`)
          .set('Authorization', `Bearer ${traineeToken}`);

        expect(page2.status).toBe(200);
        expect(page2.body.data.items.map((s) => s.name)).toEqual([`${TEST_SKILL_PREFIX}Node.js`]);
      });
    });

    describe('Trainee Skill Mapping (GET & PUT /api/v1/profiles/me/skills)', () => {
      it('persists, retrieves, replaces, clears, and rolls back on invalid skillId in real PostgreSQL', async () => {
        const adminToken = makeToken(adminUser.id);
        const traineeToken = makeToken(traineeUser.id);

        const s1 = (
          await createTestSkill(adminToken, {
            name: `${TEST_SKILL_PREFIX}PostgreSQL`,
            category: 'Databases',
          })
        ).body.data.skill;
        const s2 = (
          await createTestSkill(adminToken, {
            name: `${TEST_SKILL_PREFIX}Docker`,
            category: 'DevOps',
          })
        ).body.data.skill;
        const s3 = (
          await createTestSkill(adminToken, {
            name: `${TEST_SKILL_PREFIX}React`,
            category: 'Frontend',
          })
        ).body.data.skill;

        const initialGet = await request(app)
          .get('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${traineeToken}`);
        expect(initialGet.status).toBe(200);
        expect(initialGet.body).toEqual({ success: true, data: { skills: [] } });

        const putRes1 = await request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${traineeToken}`)
          .send({
            skills: [
              { skillId: s1.id, proficiency: 3 },
              { skillId: s2.id, proficiency: 4 },
            ],
          });

        expect(putRes1.status).toBe(200);
        expect(putRes1.body.data.skills).toEqual([
          {
            id: expect.any(String),
            skillId: s2.id,
            skillName: `${TEST_SKILL_PREFIX}Docker`,
            category: 'DevOps',
            proficiency: 4,
          },
          {
            id: expect.any(String),
            skillId: s1.id,
            skillName: `${TEST_SKILL_PREFIX}PostgreSQL`,
            category: 'Databases',
            proficiency: 3,
          },
        ]);

        const getAfterPut = await request(app)
          .get('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${traineeToken}`);
        expect(getAfterPut.status).toBe(200);
        expect(getAfterPut.body).toEqual(putRes1.body);

        const invalidRes = await request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${traineeToken}`)
          .send({
            skills: [
              { skillId: s3.id, proficiency: 2 },
              { skillId: '999999999', proficiency: 1 },
            ],
          });
        expect(invalidRes.status).toBe(404);
        expect(invalidRes.body.error.code).toBe('SKILL_NOT_FOUND');

        const getAfterInvalid = await request(app)
          .get('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${traineeToken}`);
        expect(getAfterInvalid.body).toEqual(putRes1.body);

        const putRes2 = await request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${traineeToken}`)
          .send({ skills: [{ skillId: s3.id, proficiency: 2 }] });
        expect(putRes2.status).toBe(200);
        expect(putRes2.body.data.skills).toHaveLength(1);
        expect(putRes2.body.data.skills[0]).toMatchObject({
          skillId: s3.id,
          skillName: `${TEST_SKILL_PREFIX}React`,
          category: 'Frontend',
          proficiency: 2,
        });

        const clearRes = await request(app)
          .put('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${traineeToken}`)
          .send({ skills: [] });
        expect(clearRes.status).toBe(200);
        expect(clearRes.body).toEqual({ success: true, data: { skills: [] } });

        const dbRows = await executeQuery('SELECT * FROM trainee_skills WHERE trainee_id = $1', [
          traineeUser.id,
        ]);
        expect(dbRows.rows).toHaveLength(0);
      });

      it('serializes concurrent trainee replacements using real PostgreSQL FOR UPDATE row locks', async () => {
        const adminToken = makeToken(adminUser.id);
        const traineeToken = makeToken(traineeUser.id);

        const skills = [];
        for (const suffix of ['Skill-A', 'Skill-B', 'Skill-C']) {
          const res = await createTestSkill(adminToken, {
            name: `${TEST_SKILL_PREFIX}${suffix}`,
            category: 'Core',
          });
          skills.push(res.body.data.skill);
        }

        const payloadA = [{ skillId: skills[0].id, proficiency: 2 }];
        const payloadB = [
          { skillId: skills[1].id, proficiency: 4 },
          { skillId: skills[2].id, proficiency: 3 },
        ];

        const [resA, resB] = await Promise.all([
          request(app)
            .put('/api/v1/profiles/me/skills')
            .set('Authorization', `Bearer ${traineeToken}`)
            .send({ skills: payloadA }),
          request(app)
            .put('/api/v1/profiles/me/skills')
            .set('Authorization', `Bearer ${traineeToken}`)
            .send({ skills: payloadB }),
        ]);

        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);

        const finalGet = await request(app)
          .get('/api/v1/profiles/me/skills')
          .set('Authorization', `Bearer ${traineeToken}`);
        expect(finalGet.status).toBe(200);

        const finalPairs = finalGet.body.data.skills.map((s) => ({
          skillId: s.skillId,
          proficiency: s.proficiency,
        }));
        const matchesA = JSON.stringify(finalPairs) === JSON.stringify(payloadA);
        const matchesB = JSON.stringify(finalPairs) === JSON.stringify(payloadB);
        expect(matchesA || matchesB).toBe(true);
      });
    });

    describe('Trainer Skill Mapping (GET & PUT /api/v1/profiles/me/trainer-skills)', () => {
      it('persists NUMERIC(4,1) precision, retrieves, replaces, clears, and aborts on invalid skillId', async () => {
        const adminToken = makeToken(adminUser.id);
        const trainerToken = makeToken(trainerUser.id);

        const s1 = (
          await createTestSkill(adminToken, {
            name: `${TEST_SKILL_PREFIX}Kubernetes`,
            category: 'DevOps',
          })
        ).body.data.skill;
        const s2 = (
          await createTestSkill(adminToken, {
            name: `${TEST_SKILL_PREFIX}AWS`,
            category: 'Cloud',
          })
        ).body.data.skill;

        const initialGet = await request(app)
          .get('/api/v1/profiles/me/trainer-skills')
          .set('Authorization', `Bearer ${trainerToken}`);
        expect(initialGet.status).toBe(200);
        expect(initialGet.body).toEqual({ success: true, data: { skills: [] } });

        const putRes = await request(app)
          .put('/api/v1/profiles/me/trainer-skills')
          .set('Authorization', `Bearer ${trainerToken}`)
          .send({
            skills: [
              { skillId: s1.id, proficiency: 4, yearsOfExperience: 5.5 },
              { skillId: s2.id, proficiency: 3, yearsOfExperience: 0 },
            ],
          });

        expect(putRes.status).toBe(200);
        expect(putRes.body.data.skills).toEqual([
          {
            id: expect.any(String),
            skillId: s2.id,
            skillName: `${TEST_SKILL_PREFIX}AWS`,
            category: 'Cloud',
            proficiency: 3,
            yearsOfExperience: 0,
          },
          {
            id: expect.any(String),
            skillId: s1.id,
            skillName: `${TEST_SKILL_PREFIX}Kubernetes`,
            category: 'DevOps',
            proficiency: 4,
            yearsOfExperience: 5.5,
          },
        ]);

        const getAfterPut = await request(app)
          .get('/api/v1/profiles/me/trainer-skills')
          .set('Authorization', `Bearer ${trainerToken}`);
        expect(getAfterPut.status).toBe(200);
        expect(getAfterPut.body).toEqual(putRes.body);

        const invalidRes = await request(app)
          .put('/api/v1/profiles/me/trainer-skills')
          .set('Authorization', `Bearer ${trainerToken}`)
          .send({
            skills: [{ skillId: '999999999', proficiency: 4, yearsOfExperience: 10.5 }],
          });
        expect(invalidRes.status).toBe(404);
        expect(invalidRes.body.error.code).toBe('SKILL_NOT_FOUND');

        const getAfterInvalid = await request(app)
          .get('/api/v1/profiles/me/trainer-skills')
          .set('Authorization', `Bearer ${trainerToken}`);
        expect(getAfterInvalid.body).toEqual(putRes.body);

        const clearRes = await request(app)
          .put('/api/v1/profiles/me/trainer-skills')
          .set('Authorization', `Bearer ${trainerToken}`)
          .send({ skills: [] });
        expect(clearRes.status).toBe(200);
        expect(clearRes.body).toEqual({ success: true, data: { skills: [] } });
      });

      it('serializes concurrent trainer replacements using real PostgreSQL FOR UPDATE row locks', async () => {
        const adminToken = makeToken(adminUser.id);
        const trainerToken = makeToken(trainerUser.id);

        const skills = [];
        for (const suffix of ['Go', 'Rust', 'TypeScript']) {
          const res = await createTestSkill(adminToken, {
            name: `${TEST_SKILL_PREFIX}${suffix}`,
            category: 'Languages',
          });
          skills.push(res.body.data.skill);
        }

        const payloadA = [{ skillId: skills[0].id, proficiency: 3, yearsOfExperience: 2.5 }];
        const payloadB = [
          { skillId: skills[1].id, proficiency: 4, yearsOfExperience: 7.5 },
          { skillId: skills[2].id, proficiency: 4, yearsOfExperience: 12 },
        ];

        const [resA, resB] = await Promise.all([
          request(app)
            .put('/api/v1/profiles/me/trainer-skills')
            .set('Authorization', `Bearer ${trainerToken}`)
            .send({ skills: payloadA }),
          request(app)
            .put('/api/v1/profiles/me/trainer-skills')
            .set('Authorization', `Bearer ${trainerToken}`)
            .send({ skills: payloadB }),
        ]);

        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);

        const finalGet = await request(app)
          .get('/api/v1/profiles/me/trainer-skills')
          .set('Authorization', `Bearer ${trainerToken}`);
        expect(finalGet.status).toBe(200);

        const finalTuples = finalGet.body.data.skills.map((s) => ({
          skillId: s.skillId,
          proficiency: s.proficiency,
          yearsOfExperience: s.yearsOfExperience,
        }));
        const matchesA = JSON.stringify(finalTuples) === JSON.stringify(payloadA);
        const matchesB = JSON.stringify(finalTuples) === JSON.stringify(payloadB);
        expect(matchesA || matchesB).toBe(true);
      });
    });
  },
);
