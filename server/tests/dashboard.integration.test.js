import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL_PREFIX = `cp07-it-${RUN_ID}-`;
const TEST_TITLE_PREFIX = `CP07-IT-${RUN_ID}-`;
const SUBJECT_CLOUD = `CP07-${RUN_ID}-Cloud`;
const SUBJECT_ZERO_GRADED = `CP07-${RUN_ID}-ZeroGraded`;

const { runPgIntegration, TEST_DB_NAME } = vi.hoisted(() => {
  const testDbName = 'capsera_cp03_test';
  const enabled = process.env.RUN_PG_INTEGRATION === 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'capsera-cp07-integration-test-secret';

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
import { getDashboardSummary } from '../src/modules/admin/dashboard.service.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

describe.runIf(runPgIntegration)(
  'CP-07 Admin Dashboard Real PostgreSQL Integration (capsera_cp03_test)',
  () => {
    const createdUserIds = [];
    const createdCourseIds = [];
    const createdEnrollmentIds = [];
    const createdAssessmentIds = [];
    const createdAttemptIds = [];
    const createdCertificateIds = [];

    let baselineSummary;
    let adminUser;
    let pendingAdminUser;
    let traineeA;
    let traineeB;
    let trainerUser;
    let rejectedTrainee;
    let suspendedTrainer;

    async function seedUser({ fullName, emailSlug, role, status = 'ACTIVE' }) {
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

    async function seedCourse({ title, subject = SUBJECT_CLOUD, status = 'PUBLISHED' }) {
      const publishedAtSql = status === 'PUBLISHED' ? 'NOW()' : 'NULL';
      const archivedAtSql = status === 'ARCHIVED' ? 'NOW()' : 'NULL';
      const description = status === 'PUBLISHED' ? 'CP-07 integration course' : null;
      const level = status === 'PUBLISHED' ? 'BEGINNER' : null;
      const resolvedSubject = status === 'PUBLISHED' && !subject ? SUBJECT_CLOUD : subject;

      const result = await executeQuery(
        `INSERT INTO courses (trainer_id, title, description, subject, level, status, published_at, archived_at)
         VALUES ($1, $2, $3, $4, $5, $6, ${publishedAtSql}, ${archivedAtSql})
         RETURNING id, title, subject, status`,
        [
          trainerUser.id,
          `${TEST_TITLE_PREFIX}${title}`,
          description,
          resolvedSubject,
          level,
          status,
        ],
      );
      const id = String(result.rows[0].id);
      createdCourseIds.push(id);
      return { ...result.rows[0], id };
    }

    async function seedEnrollment(traineeId, courseId, status = 'ACTIVE') {
      const completedAtSql = status === 'COMPLETED' ? 'NOW()' : 'NULL';
      const cancelledAtSql = status === 'CANCELLED' ? 'NOW()' : 'NULL';
      const result = await executeQuery(
        `INSERT INTO enrollments (trainee_id, course_id, status, completed_at, cancelled_at)
         VALUES ($1, $2, $3, ${completedAtSql}, ${cancelledAtSql})
         RETURNING id, status`,
        [traineeId, courseId, status],
      );
      const id = String(result.rows[0].id);
      createdEnrollmentIds.push(id);
      return id;
    }

    async function seedAssessment(courseId, { title, status = 'PUBLISHED' }) {
      const publishedAtSql = status === 'PUBLISHED' ? 'NOW()' : 'NULL';
      const result = await executeQuery(
        `INSERT INTO assessments (course_id, title, max_attempts, pass_percentage, is_required, status, published_at)
         VALUES ($1, $2, 5, 60.00, TRUE, $3, ${publishedAtSql})
         RETURNING id`,
        [courseId, `${TEST_TITLE_PREFIX}${title}`, status],
      );
      const id = String(result.rows[0].id);
      createdAssessmentIds.push(id);
      return id;
    }

    async function seedAttempt(
      assessmentId,
      traineeId,
      { attemptNumber, status, scorePercentage = null, isPassed = null },
    ) {
      let result;
      if (status === 'GRADED') {
        const totalPoints = 100;
        const earnedPoints = Math.round(scorePercentage);
        result = await executeQuery(
          `INSERT INTO assessment_attempts
             (assessment_id, trainee_id, attempt_number, status, started_at, submitted_at, graded_at,
              earned_points, total_points, score_percentage, is_passed)
           VALUES ($1, $2, $3, 'GRADED', NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '10 minutes',
                   NOW(), $4, $5, $6, $7)
           RETURNING id`,
          [assessmentId, traineeId, attemptNumber, earnedPoints, totalPoints, scorePercentage, isPassed],
        );
      } else if (status === 'SUBMITTED') {
        result = await executeQuery(
          `INSERT INTO assessment_attempts
             (assessment_id, trainee_id, attempt_number, status, started_at, submitted_at)
           VALUES ($1, $2, $3, 'SUBMITTED', NOW() - INTERVAL '10 minutes', NOW())
           RETURNING id`,
          [assessmentId, traineeId, attemptNumber],
        );
      } else {
        result = await executeQuery(
          `INSERT INTO assessment_attempts
             (assessment_id, trainee_id, attempt_number, status, started_at)
           VALUES ($1, $2, $3, $4, NOW() - INTERVAL '10 minutes')
           RETURNING id`,
          [assessmentId, traineeId, attemptNumber, status],
        );
      }

      const id = String(result.rows[0].id);
      createdAttemptIds.push(id);
      return id;
    }

    async function seedCertificate(traineeId, courseId, codeSuffix, { revoked = false } = {}) {
      const code = `CP07-${RUN_ID.toUpperCase()}-${codeSuffix}`;
      const revokedAtSql = revoked ? "NOW() + INTERVAL '1 second'" : 'NULL';
      const result = await executeQuery(
        `INSERT INTO certificates (trainee_id, course_id, certificate_code, issued_at, revoked_at)
         VALUES ($1, $2, $3, NOW(), ${revokedAtSql})
         RETURNING id`,
        [traineeId, courseId, code],
      );
      const id = String(result.rows[0].id);
      createdCertificateIds.push(id);
      return id;
    }

    async function cleanupTestRecords() {
      if (createdCertificateIds.length > 0) {
        await executeQuery('DELETE FROM certificates WHERE id = ANY($1::bigint[])', [
          createdCertificateIds,
        ]);
      }
      if (createdAttemptIds.length > 0) {
        await executeQuery('DELETE FROM assessment_attempts WHERE id = ANY($1::bigint[])', [
          createdAttemptIds,
        ]);
      }
      if (createdAssessmentIds.length > 0) {
        await executeQuery('DELETE FROM assessments WHERE id = ANY($1::bigint[])', [
          createdAssessmentIds,
        ]);
      }
      if (createdEnrollmentIds.length > 0) {
        await executeQuery('DELETE FROM enrollments WHERE id = ANY($1::bigint[])', [
          createdEnrollmentIds,
        ]);
      }
      if (createdCourseIds.length > 0) {
        await executeQuery('DELETE FROM courses WHERE id = ANY($1::bigint[])', [createdCourseIds]);
      }
      if (createdUserIds.length > 0) {
        await executeQuery('DELETE FROM users WHERE id = ANY($1::bigint[])', [createdUserIds]);
      }

      createdCertificateIds.length = 0;
      createdAttemptIds.length = 0;
      createdAssessmentIds.length = 0;
      createdEnrollmentIds.length = 0;
      createdCourseIds.length = 0;
      createdUserIds.length = 0;
    }

    beforeAll(async () => {
      const dbCheck = await executeQuery('SELECT current_database() AS db');
      if (dbCheck.rows[0]?.db !== TEST_DB_NAME) {
        throw new Error(
          `Expected connected database "${TEST_DB_NAME}", got "${dbCheck.rows[0]?.db}"`,
        );
      }

      // Snapshot pre-existing totals in capsera_cp03_test before seeding CP-07 fixtures.
      baselineSummary = await getDashboardSummary();

      adminUser = await seedUser({
        fullName: 'CP07 Active Admin',
        emailSlug: 'admin-active',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      pendingAdminUser = await seedUser({
        fullName: 'CP07 Pending Admin',
        emailSlug: 'admin-pending',
        role: 'ADMIN',
        status: 'PENDING',
      });
      traineeA = await seedUser({
        fullName: 'CP07 Trainee Alpha',
        emailSlug: 'trainee-a',
        role: 'TRAINEE',
        status: 'ACTIVE',
      });
      traineeB = await seedUser({
        fullName: 'CP07 Trainee Beta',
        emailSlug: 'trainee-b',
        role: 'TRAINEE',
        status: 'ACTIVE',
      });
      trainerUser = await seedUser({
        fullName: 'CP07 Active Trainer',
        emailSlug: 'trainer-active',
        role: 'TRAINER',
        status: 'ACTIVE',
      });
      rejectedTrainee = await seedUser({
        fullName: 'CP07 Rejected Trainee',
        emailSlug: 'trainee-rejected',
        role: 'TRAINEE',
        status: 'REJECTED',
      });
      suspendedTrainer = await seedUser({
        fullName: 'CP07 Suspended Trainer',
        emailSlug: 'trainer-suspended',
        role: 'TRAINER',
        status: 'SUSPENDED',
      });
    });

    afterAll(async () => {
      await cleanupTestRecords();

      const remainingUsers = await executeQuery(
        'SELECT COUNT(*)::int AS count FROM users WHERE email LIKE $1',
        [`${TEST_EMAIL_PREFIX}%`],
      );
      const remainingCourses = await executeQuery(
        'SELECT COUNT(*)::int AS count FROM courses WHERE title LIKE $1',
        [`${TEST_TITLE_PREFIX}%`],
      );

      if (remainingUsers.rows[0].count !== 0 || remainingCourses.rows[0].count !== 0) {
        throw new Error('CP-07 integration test fixtures were not fully cleaned up');
      }

      // Confirm pre-existing records remained intact after cleanup.
      const postCleanupSummary = await getDashboardSummary();
      expect(postCleanupSummary.users.total).toBe(baselineSummary.users.total);

      await pool.end();
    });

    it('enforces real JWT/role/status checks and handles empty domain tables cleanly', async () => {
      const noTokenSummary = await request(app).get('/api/v1/admin/dashboard/summary');
      expect(noTokenSummary.status).toBe(401);

      const noTokenPerf = await request(app).get('/api/v1/admin/dashboard/assessment-performance');
      expect(noTokenPerf.status).toBe(401);

      const traineeRes = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${makeToken(traineeA.id)}`);
      expect(traineeRes.status).toBe(403);
      expect(traineeRes.body.error.code).toBe('FORBIDDEN');

      const trainerRes = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${makeToken(trainerUser.id)}`);
      expect(trainerRes.status).toBe(403);
      expect(trainerRes.body.error.code).toBe('FORBIDDEN');

      const pendingRes = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${makeToken(pendingAdminUser.id)}`);
      expect(pendingRes.status).toBe(403);
      expect(pendingRes.body.error.code).toBe('ACCOUNT_PENDING');

      const rejectedRes = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${makeToken(rejectedTrainee.id)}`);
      expect(rejectedRes.status).toBe(403);
      expect(rejectedRes.body.error.code).toBe('ACCOUNT_REJECTED');

      const suspendedRes = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${makeToken(suspendedTrainer.id)}`);
      expect(suspendedRes.status).toBe(403);
      expect(suspendedRes.body.error.code).toBe('ACCOUNT_SUSPENDED');

      const adminToken = makeToken(adminUser.id);
      const emptySummaryRes = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(emptySummaryRes.status).toBe(200);
      expect(emptySummaryRes.body.data.users.total).toBe(baselineSummary.users.total + 7);

      if (baselineSummary.enrollments.total === 0) {
        expect(emptySummaryRes.body.data.enrollments.completionRate).toBe(0);
      }

      if (baselineSummary.courses.total === 0 && baselineSummary.assessments.total === 0) {
        const emptyPerfRes = await request(app)
          .get('/api/v1/admin/dashboard/assessment-performance')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(emptyPerfRes.status).toBe(200);
        expect(emptyPerfRes.body.data).toEqual({
          overall: {
            totalAssessments: 0,
            totalAttempts: 0,
            gradedAttempts: 0,
            passedAttempts: 0,
            passRate: 0,
            averageScorePercentage: null,
          },
          bySubject: [],
        });
      }
    });

    it('matches real PostgreSQL summary metrics, performance rates, subject grouping, and privacy rules', async () => {
      const adminToken = makeToken(adminUser.id);

      // Snapshot right before adding course/enrollment/assessment/attempt/certificate rows
      const preDomainSummary = await getDashboardSummary();
      const prePerfRes = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(prePerfRes.status).toBe(200);
      const preOverall = prePerfRes.body.data.overall;

      // Courses across PUBLISHED, DRAFT, ARCHIVED + distinct subjects + blank/null Unspecified
      const pubCloudCourseWithAssessments = await seedCourse({
        title: 'Cloud Course 1',
        subject: SUBJECT_CLOUD,
        status: 'PUBLISHED',
      });
      const pubCloudCourseNoAssessments = await seedCourse({
        title: 'Cloud Course 2 (No Assessments)',
        subject: SUBJECT_CLOUD,
        status: 'PUBLISHED',
      });
      const pubZeroGradedCourse = await seedCourse({
        title: 'Zero Graded Course',
        subject: SUBJECT_ZERO_GRADED,
        status: 'PUBLISHED',
      });
      const draftNullSubjectCourse = await seedCourse({
        title: 'Draft Null Subject',
        subject: null,
        status: 'DRAFT',
      });
      const archivedBlankSubjectCourse = await seedCourse({
        title: 'Archived Blank Subject',
        subject: '   ',
        status: 'ARCHIVED',
      });

      // Enrollments: traineeA enrolled in 2 courses (ACTIVE + COMPLETED), traineeB has COMPLETED + CANCELLED
      await seedEnrollment(traineeA.id, pubCloudCourseWithAssessments.id, 'COMPLETED');
      await seedEnrollment(traineeA.id, pubCloudCourseNoAssessments.id, 'ACTIVE');
      await seedEnrollment(traineeB.id, pubCloudCourseWithAssessments.id, 'COMPLETED');
      await seedEnrollment(traineeB.id, pubZeroGradedCourse.id, 'CANCELLED');

      // Assessments across DRAFT, PUBLISHED, CLOSED
      const cloudAssessment1 = await seedAssessment(pubCloudCourseWithAssessments.id, {
        title: 'Cloud Quiz 1',
        status: 'PUBLISHED',
      });
      const cloudAssessment2 = await seedAssessment(pubCloudCourseWithAssessments.id, {
        title: 'Cloud Quiz 2',
        status: 'CLOSED',
      });
      const zeroGradedAssessment = await seedAssessment(pubZeroGradedCourse.id, {
        title: 'Zero Graded Quiz',
        status: 'PUBLISHED',
      });
      await seedAssessment(draftNullSubjectCourse.id, {
        title: 'Draft Unspecified Quiz',
        status: 'DRAFT',
      });
      expect(archivedBlankSubjectCourse.id).toBeTruthy();

      // Attempts:
      // - cloudAssessment1: traineeA has 2 GRADED attempts (50 fail, 80 pass), traineeB has 1 GRADED (100 pass) + 1 SUBMITTED
      await seedAttempt(cloudAssessment1, traineeA.id, {
        attemptNumber: 1,
        status: 'GRADED',
        scorePercentage: 50,
        isPassed: false,
      });
      await seedAttempt(cloudAssessment1, traineeA.id, {
        attemptNumber: 2,
        status: 'GRADED',
        scorePercentage: 80,
        isPassed: true,
      });
      await seedAttempt(cloudAssessment1, traineeB.id, {
        attemptNumber: 1,
        status: 'GRADED',
        scorePercentage: 100,
        isPassed: true,
      });
      await seedAttempt(cloudAssessment1, traineeB.id, {
        attemptNumber: 2,
        status: 'SUBMITTED',
      });
      // - cloudAssessment2: traineeA has 1 GRADED (70 pass) -> 4 graded total in Cloud: (50+80+100+70)/4 = 75, 3 passed / 4 graded = 75%
      await seedAttempt(cloudAssessment2, traineeA.id, {
        attemptNumber: 1,
        status: 'GRADED',
        scorePercentage: 70,
        isPassed: true,
      });
      // - zeroGradedAssessment: 1 IN_PROGRESS (traineeB) + 1 EXPIRED (traineeA)
      await seedAttempt(zeroGradedAssessment, traineeB.id, {
        attemptNumber: 1,
        status: 'IN_PROGRESS',
      });
      await seedAttempt(zeroGradedAssessment, traineeA.id, {
        attemptNumber: 1,
        status: 'EXPIRED',
      });

      // Certificates: 1 valid + 1 revoked
      await seedCertificate(traineeA.id, pubCloudCourseWithAssessments.id, 'VALID1', {
        revoked: false,
      });
      await seedCertificate(traineeB.id, pubCloudCourseWithAssessments.id, 'REVOKED1', {
        revoked: true,
      });

      // 1. Verify GET /api/v1/admin/dashboard/summary against real PostgreSQL totals
      const summaryRes = await request(app)
        .get('/api/v1/admin/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.success).toBe(true);

      const summary = summaryRes.body.data;
      expect(summary.users).toEqual({
        total: baselineSummary.users.total + 7,
        byRole: {
          TRAINEE: baselineSummary.users.byRole.TRAINEE + 3,
          TRAINER: baselineSummary.users.byRole.TRAINER + 2,
          ADMIN: baselineSummary.users.byRole.ADMIN + 2,
        },
        byStatus: {
          PENDING: baselineSummary.users.byStatus.PENDING + 1,
          ACTIVE: baselineSummary.users.byStatus.ACTIVE + 4,
          REJECTED: baselineSummary.users.byStatus.REJECTED + 1,
          SUSPENDED: baselineSummary.users.byStatus.SUSPENDED + 1,
        },
      });

      expect(summary.courses).toEqual({
        total: preDomainSummary.courses.total + 5,
        byStatus: {
          DRAFT: preDomainSummary.courses.byStatus.DRAFT + 1,
          PUBLISHED: preDomainSummary.courses.byStatus.PUBLISHED + 3,
          ARCHIVED: preDomainSummary.courses.byStatus.ARCHIVED + 1,
        },
      });

      const expectedActiveEnrollments = preDomainSummary.enrollments.byStatus.ACTIVE + 1;
      const expectedCompletedEnrollments = preDomainSummary.enrollments.byStatus.COMPLETED + 2;
      const expectedCancelledEnrollments = preDomainSummary.enrollments.byStatus.CANCELLED + 1;
      const expectedCompletionRate =
        Math.round(
          (expectedCompletedEnrollments /
            (expectedActiveEnrollments + expectedCompletedEnrollments)) *
            10000,
        ) / 100;

      expect(summary.enrollments).toEqual({
        total: preDomainSummary.enrollments.total + 4,
        byStatus: {
          ACTIVE: expectedActiveEnrollments,
          COMPLETED: expectedCompletedEnrollments,
          CANCELLED: expectedCancelledEnrollments,
        },
        completionRate: expectedCompletionRate,
      });

      expect(summary.assessments).toEqual({
        total: preDomainSummary.assessments.total + 4,
        byStatus: {
          DRAFT: preDomainSummary.assessments.byStatus.DRAFT + 1,
          PUBLISHED: preDomainSummary.assessments.byStatus.PUBLISHED + 2,
          CLOSED: preDomainSummary.assessments.byStatus.CLOSED + 1,
        },
      });

      expect(summary.attempts).toEqual({
        total: preDomainSummary.attempts.total + 7,
        byStatus: {
          IN_PROGRESS: preDomainSummary.attempts.byStatus.IN_PROGRESS + 1,
          SUBMITTED: preDomainSummary.attempts.byStatus.SUBMITTED + 1,
          GRADED: preDomainSummary.attempts.byStatus.GRADED + 4,
          EXPIRED: preDomainSummary.attempts.byStatus.EXPIRED + 1,
        },
        passedCount: preDomainSummary.attempts.passedCount + 3,
      });

      expect(summary.certificates).toEqual({
        totalIssued: preDomainSummary.certificates.totalIssued + 2,
        validCount: preDomainSummary.certificates.validCount + 1,
        revokedCount: preDomainSummary.certificates.revokedCount + 1,
      });

      // Distinct trainees: traineeA & traineeB each appear across multiple rows -> +2 distinct (not 3 or 5)
      expect(summary.participation).toEqual({
        enrolledTrainees: preDomainSummary.participation.enrolledTrainees + 2,
        attemptingTrainees: preDomainSummary.participation.attemptingTrainees + 2,
      });

      // 2. Verify GET /api/v1/admin/dashboard/assessment-performance against real PostgreSQL totals
      const perfRes = await request(app)
        .get('/api/v1/admin/dashboard/assessment-performance')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(perfRes.status).toBe(200);
      expect(perfRes.body.success).toBe(true);

      const perf = perfRes.body.data;
      expect(perf.overall.totalAssessments).toBe(preOverall.totalAssessments + 4);
      expect(perf.overall.totalAttempts).toBe(preOverall.totalAttempts + 7);
      expect(perf.overall.gradedAttempts).toBe(preOverall.gradedAttempts + 4);
      expect(perf.overall.passedAttempts).toBe(preOverall.passedAttempts + 3);
      expect(typeof perf.overall.passRate).toBe('number');

      if (preOverall.gradedAttempts === 0) {
        expect(perf.overall.passRate).toBe(75);
        expect(perf.overall.averageScorePercentage).toBe(75);
      }

      const cloudSubjectRow = perf.bySubject.find((item) => item.subject === SUBJECT_CLOUD);
      expect(cloudSubjectRow).toEqual({
        subject: SUBJECT_CLOUD,
        courseCount: 2,
        assessmentCount: 2,
        attemptCount: 5,
        gradedAttemptCount: 4,
        passedAttemptCount: 3,
        passRate: 75,
        averageScorePercentage: 75,
      });

      const zeroGradedRow = perf.bySubject.find((item) => item.subject === SUBJECT_ZERO_GRADED);
      expect(zeroGradedRow).toEqual({
        subject: SUBJECT_ZERO_GRADED,
        courseCount: 1,
        assessmentCount: 1,
        attemptCount: 2,
        gradedAttemptCount: 0,
        passedAttemptCount: 0,
        passRate: 0,
        averageScorePercentage: null,
      });

      const unspecifiedRow = perf.bySubject.find((item) => item.subject === 'Unspecified');
      expect(unspecifiedRow).toBeDefined();
      expect(unspecifiedRow.courseCount).toBeGreaterThanOrEqual(2);
      expect(unspecifiedRow.assessmentCount).toBeGreaterThanOrEqual(1);

      // Privacy verification across both JSON responses
      const combinedJson = `${JSON.stringify(summary)}|${JSON.stringify(perf)}`;
      expect(combinedJson).not.toContain(adminUser.email);
      expect(combinedJson).not.toContain(traineeA.email);
      expect(combinedJson).not.toContain(traineeB.email);
      expect(combinedJson).not.toContain(traineeA.fullName);
      expect(combinedJson).not.toContain('passwordHash');
    });
  },
);

