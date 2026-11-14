import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL_PREFIX = `cp04-it-${RUN_ID}-`;
const TEST_SKILL_PREFIX = `CP04-IT-${RUN_ID}-`;

const { runPgIntegration, TEST_DB_NAME } = vi.hoisted(() => {
  const testDbName = 'capsera_cp03_test';
  const enabled = process.env.RUN_PG_INTEGRATION === 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'capsera-cp04-integration-test-secret';

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
  'CP-04 Trainer Recommendations Real PostgreSQL Integration (capsera_cp03_test)',
  () => {
    const createdUserIds = [];
    const createdSkillIds = [];
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

    async function seedTrainerProfile(
      userId,
      { headline = null, organization = null, subjectExpertise = null, yearsOfExperience = 0.0 },
    ) {
      await executeQuery(
        `INSERT INTO trainer_profiles (user_id, headline, organization, subject_expertise, years_of_experience)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, headline, organization, subjectExpertise, yearsOfExperience],
      );
    }

    async function seedTrainerSkill(trainerId, skillId, proficiency, yearsOfExperience) {
      await executeQuery(
        `INSERT INTO trainer_skills (trainer_id, skill_id, proficiency, years_of_experience)
         VALUES ($1, $2, $3, $4)`,
        [trainerId, skillId, proficiency, yearsOfExperience],
      );
    }

    async function seedTestSkill({ name, category }) {
      const result = await executeQuery(
        `INSERT INTO skills (name, category)
         VALUES ($1, $2)
         RETURNING id, name, category`,
        [name, category],
      );
      const id = String(result.rows[0].id);
      createdSkillIds.push(id);
      return { ...result.rows[0], id };
    }

    async function cleanupTestRecords() {
      if (createdUserIds.length > 0) {
        await executeQuery('DELETE FROM trainer_profiles WHERE user_id = ANY($1::bigint[])', [
          createdUserIds,
        ]);
        await executeQuery('DELETE FROM trainer_skills WHERE trainer_id = ANY($1::bigint[])', [
          createdUserIds,
        ]);
        await executeQuery('DELETE FROM trainee_skills WHERE trainee_id = ANY($1::bigint[])', [
          createdUserIds,
        ]);
      }
      if (createdSkillIds.length > 0) {
        await executeQuery('DELETE FROM trainer_skills WHERE skill_id = ANY($1::bigint[])', [
          createdSkillIds,
        ]);
        await executeQuery('DELETE FROM trainee_skills WHERE skill_id = ANY($1::bigint[])', [
          createdSkillIds,
        ]);
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
        fullName: 'CP04 Integration Admin',
        emailSlug: 'admin',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      traineeUser = await seedTestUser({
        fullName: 'CP04 Integration Trainee',
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

    it('returns an empty list for an existing skill with no matching trainers and 404 SKILL_NOT_FOUND for nonexistent skills', async () => {
      const traineeToken = makeToken(traineeUser.id);
      const emptySkill = await seedTestSkill({
        name: `${TEST_SKILL_PREFIX}Elixir`,
        category: 'Backend',
      });

      const emptyRes = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${emptySkill.id}`)
        .set('Authorization', `Bearer ${traineeToken}`);

      expect(emptyRes.status).toBe(200);
      expect(emptyRes.body).toEqual({
        success: true,
        data: {
          skill: {
            id: emptySkill.id,
            name: emptySkill.name,
            category: emptySkill.category,
          },
          items: [],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 0,
            totalPages: 0,
          },
        },
      });

      const missingRes = await request(app)
        .get('/api/v1/trainers/recommendations?skillId=999999999999')
        .set('Authorization', `Bearer ${traineeToken}`);

      expect(missingRes.status).toBe(404);
      expect(missingRes.body.success).toBe(false);
      expect(missingRes.body.error.code).toBe('SKILL_NOT_FOUND');
    });

    it('includes only ACTIVE TRAINER users matching exact skillId and excludes PENDING, REJECTED, SUSPENDED, non-trainer roles, and other skills', async () => {
      const targetSkill = await seedTestSkill({
        name: `${TEST_SKILL_PREFIX}Node.js`,
        category: 'Backend',
      });
      const otherSkill = await seedTestSkill({
        name: `${TEST_SKILL_PREFIX}Go`,
        category: 'Backend',
      });

      const eligibleTrainer = await seedTestUser({
        fullName: 'Eligible Active Trainer',
        emailSlug: 'eligible',
        role: 'TRAINER',
        status: 'ACTIVE',
      });
      const pendingTrainer = await seedTestUser({
        fullName: 'Pending Trainer',
        emailSlug: 'pending-trainer',
        role: 'TRAINER',
        status: 'PENDING',
      });
      const rejectedTrainer = await seedTestUser({
        fullName: 'Rejected Trainer',
        emailSlug: 'rejected-trainer',
        role: 'TRAINER',
        status: 'REJECTED',
      });
      const suspendedTrainer = await seedTestUser({
        fullName: 'Suspended Trainer',
        emailSlug: 'suspended-trainer',
        role: 'TRAINER',
        status: 'SUSPENDED',
      });
      const otherSkillTrainer = await seedTestUser({
        fullName: 'Other Skill Trainer',
        emailSlug: 'other-skill-trainer',
        role: 'TRAINER',
        status: 'ACTIVE',
      });

      await seedTrainerSkill(eligibleTrainer.id, targetSkill.id, 3, 2.0);
      await seedTrainerSkill(pendingTrainer.id, targetSkill.id, 4, 15.0);
      await seedTrainerSkill(rejectedTrainer.id, targetSkill.id, 4, 15.0);
      await seedTrainerSkill(suspendedTrainer.id, targetSkill.id, 4, 15.0);
      // Verify role filter works even if non-TRAINER users have trainer_skills rows
      await seedTrainerSkill(traineeUser.id, targetSkill.id, 4, 10.0);
      await seedTrainerSkill(adminUser.id, targetSkill.id, 4, 10.0);
      // Verify exact skillId match
      await seedTrainerSkill(otherSkillTrainer.id, otherSkill.id, 4, 12.0);

      const res = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${targetSkill.id}`)
        .set('Authorization', `Bearer ${makeToken(traineeUser.id)}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.totalItems).toBe(1);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].trainerId).toBe(eligibleTrainer.id);

      // ADMIN can also request recommendations; ACTIVE TRAINER is forbidden
      const adminRes = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${targetSkill.id}`)
        .set('Authorization', `Bearer ${makeToken(adminUser.id)}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.items.map((item) => item.trainerId)).toEqual([eligibleTrainer.id]);

      const trainerForbiddenRes = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${targetSkill.id}`)
        .set('Authorization', `Bearer ${makeToken(eligibleTrainer.id)}`);
      expect(trainerForbiddenRes.status).toBe(403);
      expect(trainerForbiddenRes.body.error.code).toBe('FORBIDDEN');
    });

    it('ranks deterministically by proficiency DESC, skill experience DESC, LOWER(full_name) ASC, id ASC, preserves trainers without profiles, paginates, and matches contract DTOs', async () => {
      const skill = await seedTestSkill({
        name: `${TEST_SKILL_PREFIX}PostgreSQL`,
        category: 'Databases',
      });

      // Rank 1: proficiency 4, 1.0 yr (tests proficiency beats higher experience at prof 3, plus singular explanation & missing trainer_profiles row)
      const rank1NoProfile = await seedTestUser({
        fullName: 'Zoe TopProf',
        emailSlug: 'rank1',
        role: 'TRAINER',
        status: 'ACTIVE',
      });

      // Rank 2: proficiency 3, 7.5 yrs (skill experience beats profile experience and lower skill experience)
      const rank2HighExp = await seedTestUser({
        fullName: 'Maya Experienced',
        emailSlug: 'rank2',
        role: 'TRAINER',
        status: 'ACTIVE',
      });
      await seedTrainerProfile(rank2HighExp.id, {
        headline: 'Database Principal',
        organization: 'Capsera Labs',
        subjectExpertise: 'PostgreSQL Internals',
        yearsOfExperience: 2.0,
      });

      // Rank 3: proficiency 3, 4.0 yrs, lowercase 'alice' must sort before uppercase 'Bob' via LOWER(full_name) ASC
      const rank3AliceLower = await seedTestUser({
        fullName: 'alice tiebreak',
        emailSlug: 'rank3',
        role: 'TRAINER',
        status: 'ACTIVE',
      });
      await seedTrainerProfile(rank3AliceLower.id, {
        headline: 'SQL Coach',
        organization: null,
        subjectExpertise: 'Indexing',
        yearsOfExperience: 25.0,
      });

      // Rank 4 & Rank 5: proficiency 3, 4.0 yrs, case-insensitively equal full_name -> lower user.id wins
      const firstIdSameName = await seedTestUser({
        fullName: 'sam rivera',
        emailSlug: 'rank4',
        role: 'TRAINER',
        status: 'ACTIVE',
      });
      const secondIdSameName = await seedTestUser({
        fullName: 'SAM RIVERA',
        emailSlug: 'rank5',
        role: 'TRAINER',
        status: 'ACTIVE',
      });

      // Rank 6: proficiency 2, 0.0 yrs
      const rank6LowerProf = await seedTestUser({
        fullName: 'Aaron BeginnerPlus',
        emailSlug: 'rank6',
        role: 'TRAINER',
        status: 'ACTIVE',
      });
      await seedTrainerProfile(rank6LowerProf.id, {
        headline: 'Junior Mentor',
        organization: 'Bootcamp',
        subjectExpertise: null,
        yearsOfExperience: 30.0,
      });

      await seedTrainerSkill(rank6LowerProf.id, skill.id, 2, 0.0);
      await seedTrainerSkill(secondIdSameName.id, skill.id, 3, 4.0);
      await seedTrainerSkill(firstIdSameName.id, skill.id, 3, 4.0);
      await seedTrainerSkill(rank3AliceLower.id, skill.id, 3, 4.0);
      await seedTrainerSkill(rank2HighExp.id, skill.id, 3, 7.5);
      await seedTrainerSkill(rank1NoProfile.id, skill.id, 4, 1.0);

      const traineeToken = makeToken(traineeUser.id);
      const expectedOrderedIds = [
        rank1NoProfile.id,
        rank2HighExp.id,
        rank3AliceLower.id,
        firstIdSameName.id,
        secondIdSameName.id,
        rank6LowerProf.id,
      ];

      // Full page verification + contract DTO / explanation checks
      const fullRes = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${skill.id}&page=1&pageSize=20`)
        .set('Authorization', `Bearer ${traineeToken}`);

      expect(fullRes.status).toBe(200);
      expect(fullRes.body.success).toBe(true);
      expect(fullRes.body.data.skill).toEqual({
        id: skill.id,
        name: skill.name,
        category: skill.category,
      });
      expect(fullRes.body.data.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalItems: 6,
        totalPages: 1,
      });
      expect(fullRes.body.data.items.map((item) => item.trainerId)).toEqual(expectedOrderedIds);

      // Verify missing profile row still returned with null metadata and singular experience grammar
      expect(fullRes.body.data.items[0]).toEqual({
        trainerId: rank1NoProfile.id,
        fullName: 'Zoe TopProf',
        headline: null,
        organization: null,
        subjectExpertise: null,
        proficiency: 4,
        proficiencyLabel: 'EXPERT',
        yearsOfExperience: 1,
        explanation: {
          matchedSkill: skill.name,
          proficiency: 4,
          proficiencyLabel: 'EXPERT',
          yearsOfExperience: 1,
          summary: `Matches ${skill.name}; expert proficiency; 1 year's experience.`,
        },
      });
      expect(typeof fullRes.body.data.items[0].trainerId).toBe('string');
      expect(typeof fullRes.body.data.items[0].proficiency).toBe('number');
      expect(typeof fullRes.body.data.items[0].yearsOfExperience).toBe('number');

      // Verify joined profile metadata & fractional experience formatting
      expect(fullRes.body.data.items[1]).toEqual({
        trainerId: rank2HighExp.id,
        fullName: 'Maya Experienced',
        headline: 'Database Principal',
        organization: 'Capsera Labs',
        subjectExpertise: 'PostgreSQL Internals',
        proficiency: 3,
        proficiencyLabel: 'ADVANCED',
        yearsOfExperience: 7.5,
        explanation: {
          matchedSkill: skill.name,
          proficiency: 3,
          proficiencyLabel: 'ADVANCED',
          yearsOfExperience: 7.5,
          summary: `Matches ${skill.name}; advanced proficiency; 7.5 years' experience.`,
        },
      });

      // Verify zero experience formatting
      expect(fullRes.body.data.items[5]).toMatchObject({
        trainerId: rank6LowerProf.id,
        proficiency: 2,
        proficiencyLabel: 'INTERMEDIATE',
        yearsOfExperience: 0,
        explanation: {
          matchedSkill: skill.name,
          proficiency: 2,
          proficiencyLabel: 'INTERMEDIATE',
          yearsOfExperience: 0,
          summary: `Matches ${skill.name}; intermediate proficiency; 0 years' experience.`,
        },
      });

      // Pagination across multiple pages
      const page1 = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${skill.id}&page=1&pageSize=2`)
        .set('Authorization', `Bearer ${traineeToken}`);
      const page2 = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${skill.id}&page=2&pageSize=2`)
        .set('Authorization', `Bearer ${traineeToken}`);
      const page3 = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${skill.id}&page=3&pageSize=2`)
        .set('Authorization', `Bearer ${traineeToken}`);
      const page4 = await request(app)
        .get(`/api/v1/trainers/recommendations?skillId=${skill.id}&page=4&pageSize=2`)
        .set('Authorization', `Bearer ${traineeToken}`);

      expect(page1.status).toBe(200);
      expect(page1.body.data.pagination).toEqual({
        page: 1,
        pageSize: 2,
        totalItems: 6,
        totalPages: 3,
      });
      expect(page1.body.data.items.map((item) => item.trainerId)).toEqual(
        expectedOrderedIds.slice(0, 2),
      );

      expect(page2.status).toBe(200);
      expect(page2.body.data.items.map((item) => item.trainerId)).toEqual(
        expectedOrderedIds.slice(2, 4),
      );

      expect(page3.status).toBe(200);
      expect(page3.body.data.items.map((item) => item.trainerId)).toEqual(
        expectedOrderedIds.slice(4, 6),
      );

      expect(page4.status).toBe(200);
      expect(page4.body.data.items).toEqual([]);
      expect(page4.body.data.pagination).toEqual({
        page: 4,
        pageSize: 2,
        totalItems: 6,
        totalPages: 3,
      });
    });
  },
);