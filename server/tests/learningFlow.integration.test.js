import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL_PREFIX = `m2-it-${RUN_ID}-`;
const TEST_COURSE_PREFIX = `M2-IT-${RUN_ID}-`;

const { runPgIntegration, TEST_DB_NAME } = vi.hoisted(() => {
  const testDbName = 'capsera_cp03_test';
  const enabled = process.env.RUN_PG_INTEGRATION === 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'capsera-m2-integration-test-secret';

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

function makeToken(userId, role = 'TRAINEE') {
  return jwt.sign({ sub: String(userId), role }, env.jwtSecret, { expiresIn: '1h' });
}

describe.runIf(runPgIntegration)(
  'Member 2 Learning Flow Real PostgreSQL Integration (capsera_cp03_test)',
  () => {
    const createdUserIds = [];
    const createdCourseIds = [];

    async function createTestUser({ role, status = 'ACTIVE' }) {
      const unique = crypto.randomBytes(4).toString('hex');
      const email = `${TEST_EMAIL_PREFIX}${unique}@example.com`;
      const res = await executeQuery(
        `INSERT INTO users (email, password_hash, full_name, role, status, created_at, updated_at)
         VALUES ($1, 'hashed_test_password', $2, $3, $4, NOW(), NOW())
         RETURNING id, email, full_name, role, status`,
        [email, `Test User ${unique}`, role, status],
      );
      const user = res.rows[0];
      createdUserIds.push(user.id);
      return user;
    }

    async function cleanupTestRecords() {
      if (createdCourseIds.length > 0 || createdUserIds.length > 0) {
        // 1. Delete audit logs associated with certificates for test courses/trainees
        await executeQuery(
          `DELETE FROM audit_logs
           WHERE (target_entity = 'certificates'
                  AND target_id IN (
                    SELECT id FROM certificates
                    WHERE course_id = ANY($1::bigint[])
                       OR trainee_id = ANY($2::bigint[])
                  ))
              OR actor_user_id = ANY($2::bigint[])`,
          [createdCourseIds, createdUserIds],
        );

        // 2. Delete certificates
        await executeQuery(
          `DELETE FROM certificates
           WHERE course_id = ANY($1::bigint[])
              OR trainee_id = ANY($2::bigint[])`,
          [createdCourseIds, createdUserIds],
        );

        // 3. Delete assessment attempt answers, attempts, questions and assessments
        await executeQuery(
          `DELETE FROM attempt_answers
           WHERE attempt_id IN (
             SELECT id FROM assessment_attempts
             WHERE trainee_id = ANY($2::bigint[])
                OR assessment_id IN (SELECT id FROM assessments WHERE course_id = ANY($1::bigint[]))
           )`,
          [createdCourseIds, createdUserIds],
        );

        await executeQuery(
          `DELETE FROM assessment_attempts
           WHERE trainee_id = ANY($2::bigint[])
              OR assessment_id IN (SELECT id FROM assessments WHERE course_id = ANY($1::bigint[]))`,
          [createdCourseIds, createdUserIds],
        );

        await executeQuery(
          `DELETE FROM questions
           WHERE assessment_id IN (SELECT id FROM assessments WHERE course_id = ANY($1::bigint[]))`,
          [createdCourseIds],
        );

        await executeQuery(
          `DELETE FROM assessments
           WHERE course_id = ANY($1::bigint[])`,
          [createdCourseIds],
        );

        // 4. Delete course feedback
        await executeQuery(
          `DELETE FROM feedback
           WHERE course_id = ANY($1::bigint[])
              OR trainee_id = ANY($2::bigint[])`,
          [createdCourseIds, createdUserIds],
        );

        // 5. Delete lesson progress
        await executeQuery(
          `DELETE FROM lesson_progress
           WHERE course_id = ANY($1::bigint[])
              OR enrollment_id IN (
                SELECT id FROM enrollments
                WHERE course_id = ANY($1::bigint[])
                   OR trainee_id = ANY($2::bigint[])
              )`,
          [createdCourseIds, createdUserIds],
        );

        // 6. Delete enrollments
        await executeQuery(
          `DELETE FROM enrollments
           WHERE course_id = ANY($1::bigint[])
              OR trainee_id = ANY($2::bigint[])`,
          [createdCourseIds, createdUserIds],
        );

        // 7. Delete announcements created by test users if any
        await executeQuery(
          `DELETE FROM announcements
           WHERE creator_id = ANY($1::bigint[])`,
          [createdUserIds],
        );

        // 8. Delete learning resources if any
        await executeQuery(
          `DELETE FROM learning_resources
           WHERE course_id = ANY($1::bigint[])`,
          [createdCourseIds],
        );

        // 9. Delete lessons
        await executeQuery(
          `DELETE FROM lessons
           WHERE course_id = ANY($1::bigint[])`,
          [createdCourseIds],
        );

        // 10. Delete courses
        await executeQuery(
          `DELETE FROM courses
           WHERE id = ANY($1::bigint[])
              OR trainer_id = ANY($2::bigint[])`,
          [createdCourseIds, createdUserIds],
        );

        // 11. Delete user profiles and skill mappings
        await executeQuery(
          `DELETE FROM trainee_profiles
           WHERE user_id = ANY($1::bigint[])`,
          [createdUserIds],
        );

        await executeQuery(
          `DELETE FROM trainer_profiles
           WHERE user_id = ANY($1::bigint[])`,
          [createdUserIds],
        );

        await executeQuery(
          `DELETE FROM trainee_skills
           WHERE trainee_id = ANY($1::bigint[])`,
          [createdUserIds],
        );

        await executeQuery(
          `DELETE FROM trainer_skills
           WHERE trainer_id = ANY($1::bigint[])`,
          [createdUserIds],
        );

        // 12. Delete users
        await executeQuery(
          `DELETE FROM users
           WHERE id = ANY($1::bigint[])`,
          [createdUserIds],
        );

        createdCourseIds.length = 0;
        createdUserIds.length = 0;
      }
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
    });

    afterEach(async () => {
      await cleanupTestRecords();
    });

    afterAll(async () => {
      await pool.end();
    });

    it('executes full end-to-end learning lifecycle against real PostgreSQL database', async () => {
      const trainer = await createTestUser({ role: 'TRAINER' });
      const trainee = await createTestUser({ role: 'TRAINEE' });
      const trainerToken = makeToken(trainer.id, 'TRAINER');
      const traineeToken = makeToken(trainee.id, 'TRAINEE');

      // 1. Trainer creates course in DRAFT
      const createRes = await request(app)
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          title: `${TEST_COURSE_PREFIX}PostgreSQL Lifecycle`,
          summary: 'Testing learning lifecycle against live database',
          description: 'Full course description for real database integration testing.',
          subject: 'Database Systems',
          level: 'BEGINNER',
        });

      expect(createRes.status).toBe(201);
      const courseId = createRes.body.data.course.id;
      createdCourseIds.push(courseId);

      // 2. Trainer adds 2 lessons
      const l1Res = await request(app)
        .post(`/api/v1/courses/${courseId}/lessons`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          title: 'Lesson 1: Schemas and Tables',
          content: 'Understanding PostgreSQL relational integrity.',
        });
      expect(l1Res.status).toBe(201);
      const l1Id = l1Res.body.data.lesson.id;

      const l2Res = await request(app)
        .post(`/api/v1/courses/${courseId}/lessons`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({
          title: 'Lesson 2: Foreign Keys and Indexes',
          content: 'Enforcing composite keys and data constraints.',
        });
      expect(l2Res.status).toBe(201);
      const l2Id = l2Res.body.data.lesson.id;

      // 3. Trainer publishes course
      const publishRes = await request(app)
        .post(`/api/v1/courses/${courseId}/publish`)
        .set('Authorization', `Bearer ${trainerToken}`);
      expect(publishRes.status).toBe(200);
      expect(publishRes.body.data.course.status).toBe('PUBLISHED');

      // 4. Trainee enrolls in course
      const enrollRes = await request(app)
        .post(`/api/v1/courses/${courseId}/enrollments`)
        .set('Authorization', `Bearer ${traineeToken}`);
      expect(enrollRes.status).toBe(201);
      const enrollmentId = enrollRes.body.data.enrollment.id;

      // 5. Duplicate enrollment returns 409
      const dupRes = await request(app)
        .post(`/api/v1/courses/${courseId}/enrollments`)
        .set('Authorization', `Bearer ${traineeToken}`);
      expect(dupRes.status).toBe(409);

      // 6. Trainee marks Lesson 1 complete -> 50%
      const prog1Res = await request(app)
        .patch(`/api/v1/enrollments/${enrollmentId}/progress`)
        .set('Authorization', `Bearer ${traineeToken}`)
        .send({ lessonId: l1Id });
      expect(prog1Res.status).toBe(200);
      expect(prog1Res.body.data.progressPercentage).toBe(50);

      // 7. Trainee marks Lesson 2 complete -> 100% and COMPLETED
      const prog2Res = await request(app)
        .patch(`/api/v1/enrollments/${enrollmentId}/progress`)
        .set('Authorization', `Bearer ${traineeToken}`)
        .send({ lessonId: l2Id });
      expect(prog2Res.status).toBe(200);
      expect(prog2Res.body.data.progressPercentage).toBe(100);

      // 8. Trainee calls GET /api/v1/enrollments/me
      const myEnrollmentsRes = await request(app)
        .get('/api/v1/enrollments/me')
        .set('Authorization', `Bearer ${traineeToken}`);
      expect(myEnrollmentsRes.status).toBe(200);
      const enrolledItem = myEnrollmentsRes.body.data.enrollments.find((e) => e.id === enrollmentId);
      expect(enrolledItem).toBeDefined();
      expect(enrolledItem.progressPercentage).toBe(100);
      expect(enrolledItem.status).toBe('COMPLETED');
    });
  },
);
