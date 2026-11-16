import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-enrollments-tests-32-chars';
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery } from '../src/config/db.js';
import { calculateCourseProgress } from '../src/modules/enrollments/progress.helpers.js';
import { evaluateCourseCompletion } from '../src/modules/enrollments/completion.hook.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockAuthUser({
  id = '20',
  fullName = 'Trainee One',
  email = 'trainee1@example.com',
  role = 'TRAINEE',
  status = 'ACTIVE',
} = {}) {
  executeQuery.mockResolvedValueOnce({
    rows: [{ id, full_name: fullName, email, role, status }],
  });
}

function makeCourseRow(overrides = {}) {
  const now = new Date('2026-11-11T10:00:00.000Z');
  return {
    id: '1',
    trainer_id: '10',
    title: 'Atmospheric Data Modeling',
    summary: 'Introductory meteorology course',
    description: 'Detailed syllabus covering synoptic forecasting.',
    subject: 'Meteorology',
    level: 'BEGINNER',
    thumbnail_url: 'https://cdn.example.com/thumb.png',
    status: 'PUBLISHED',
    published_at: now,
    archived_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeEnrollmentRow(overrides = {}) {
  const now = new Date('2026-11-12T10:00:00.000Z');
  return {
    id: '100',
    trainee_id: '20',
    course_id: '1',
    status: 'ACTIVE',
    enrolled_at: now,
    completed_at: null,
    cancelled_at: null,
    updated_at: now,
    ...overrides,
  };
}

describe('Enrollments API & Progress Tracking', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/v1/courses/:courseId/enrollments', () => {
    it('allows an active trainee to enroll in a PUBLISHED course (201)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      // Course lookup
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '1', status: 'PUBLISHED' })],
      });
      // Insert enrollment
      executeQuery.mockResolvedValueOnce({
        rows: [makeEnrollmentRow({ id: '100', trainee_id: '20', course_id: '1' })],
      });

      const res = await request(app)
        .post('/api/v1/courses/1/enrollments')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrollment).toMatchObject({
        id: '100',
        traineeId: '20',
        courseId: '1',
        status: 'ACTIVE',
      });
    });

    it('rejects duplicate enrollment by catching unique constraint error (409 DUPLICATE_ENROLLMENT)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      // Course lookup
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '1', status: 'PUBLISHED' })],
      });
      // Insert raises unique constraint violation (23505)
      executeQuery.mockRejectedValueOnce({
        code: '23505',
        constraint: 'uq_enrollments_trainee_course',
        message: 'duplicate key value violates unique constraint "uq_enrollments_trainee_course"',
      });

      const res = await request(app)
        .post('/api/v1/courses/1/enrollments')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_ENROLLMENT');
      expect(res.body.error.message).toContain('already enrolled');
    });

    it('rejects enrolling in a DRAFT course (409 COURSE_NOT_PUBLISHED)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '2', status: 'DRAFT' })],
      });

      const res = await request(app)
        .post('/api/v1/courses/2/enrollments')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('COURSE_NOT_PUBLISHED');
    });

    it('rejects enrolling in an ARCHIVED course (409 COURSE_ARCHIVED)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeCourseRow({ id: '3', status: 'ARCHIVED' })],
      });

      const res = await request(app)
        .post('/api/v1/courses/3/enrollments')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('COURSE_ARCHIVED');
    });

    it('returns 404 when target course does not exist', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/courses/999/enrollments')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('COURSE_NOT_FOUND');
    });

    it('rejects non-trainee users from enrolling (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER', status: 'ACTIVE' });

      const res = await request(app)
        .post('/api/v1/courses/1/enrollments')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Progress Calculation Helper', () => {
    it('returns 0% when a course has zero lessons (not 100%)', async () => {
      // Total lessons count
      executeQuery.mockResolvedValueOnce({
        rows: [{ count: 0 }],
      });

      const result = await calculateCourseProgress('1', '100');
      expect(result.totalLessons).toBe(0);
      expect(result.completedLessons).toBe(0);
      expect(result.progressPercentage).toBe(0);
    });

    it('calculates accurate progress percentage from saved database records', async () => {
      // 4 total lessons
      executeQuery.mockResolvedValueOnce({
        rows: [{ count: 4 }],
      });
      // 2 completed lessons
      executeQuery.mockResolvedValueOnce({
        rows: [{ count: 2 }],
      });

      const result = await calculateCourseProgress('1', '100');
      expect(result.totalLessons).toBe(4);
      expect(result.completedLessons).toBe(2);
      expect(result.progressPercentage).toBe(50);
    });

    it('calculates 100% when all lessons are completed', async () => {
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 5 }] });
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 5 }] });

      const result = await calculateCourseProgress('1', '100');
      expect(result.progressPercentage).toBe(100);
    });
  });

  describe('GET /api/v1/enrollments/me', () => {
    it('returns logged-in trainee enrollments with progress percentage (200)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      // Query enrollments
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            ...makeEnrollmentRow({ id: '101', course_id: '1', status: 'ACTIVE' }),
            course_title: 'Intro to Meteorology',
            course_summary: 'Weather fundamentals',
            course_subject: 'Meteorology',
            course_level: 'BEGINNER',
            course_thumbnail_url: null,
            course_status: 'PUBLISHED',
          },
        ],
      });
      // calculateCourseProgress: total lessons
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 10 }] });
      // calculateCourseProgress: completed lessons
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 3 }] });

      const res = await request(app)
        .get('/api/v1/enrollments/me')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrollments).toHaveLength(1);
      expect(res.body.data.enrollments[0]).toMatchObject({
        id: '101',
        traineeId: '20',
        courseId: '1',
        courseTitle: 'Intro to Meteorology',
        progressPercentage: 30,
        completedLessons: 3,
        totalLessons: 10,
      });
    });

    it('rejects non-trainee from accessing /enrollments/me (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '1', role: 'ADMIN', status: 'ACTIVE' });

      const res = await request(app)
        .get('/api/v1/enrollments/me')
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/v1/enrollments/:enrollmentId/progress', () => {
    it('allows trainee to mark a lesson complete and returns updated progress (200)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      // Enrollment lookup
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainee_id: '20', course_id: '1', status: 'ACTIVE' }],
      });
      // Lesson lookup
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '5', course_id: '1' }],
      });
      // Insert into lesson_progress
      executeQuery.mockResolvedValueOnce({ rows: [] });
      // Progress calculation: total lessons
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      // Progress calculation: completed lessons
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] });
      // Completion check: progress calculation
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] });

      const res = await request(app)
        .patch('/api/v1/enrollments/100/progress')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ lessonId: '5' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        enrollmentId: '100',
        courseId: '1',
        lessonId: '5',
        completed: true,
        progressPercentage: 50,
        completedLessons: 1,
        totalLessons: 2,
        isComplete: false,
      });
    });

    it('is safe on repeated calls for the same lesson (idempotent)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainee_id: '20', course_id: '1', status: 'ACTIVE' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '5', course_id: '1' }],
      });
      // ON CONFLICT DO NOTHING returns empty rows
      executeQuery.mockResolvedValueOnce({ rows: [] });
      // Progress calculation
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] });
      // Completion check
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] });

      const res = await request(app)
        .patch('/api/v1/enrollments/100/progress')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ lessonId: '5' });

      expect(res.status).toBe(200);
      expect(res.body.data.completed).toBe(true);
    });

    it('rejects a lesson that belongs to another course (400 LESSON_COURSE_MISMATCH)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      // Enrollment for course 1
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainee_id: '20', course_id: '1', status: 'ACTIVE' }],
      });
      // Lesson belongs to course 99
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '55', course_id: '99' }],
      });

      const res = await request(app)
        .patch('/api/v1/enrollments/100/progress')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ lessonId: '55' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('LESSON_COURSE_MISMATCH');
    });

    it('prevents trainee from updating another trainee enrollment (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE', status: 'ACTIVE' });
      // Enrollment belongs to trainee 21
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainee_id: '21', course_id: '1', status: 'ACTIVE' }],
      });

      const res = await request(app)
        .patch('/api/v1/enrollments/100/progress')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ lessonId: '5' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Course Completion Rule Hook', () => {
    it('marks enrollment COMPLETED when all lessons done and no required assessment exists', async () => {
      // 2 total lessons, 2 completed lessons
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      // assessments query: no required published assessment
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const evaluation = await evaluateCourseCompletion('1', '100', '20');
      expect(evaluation.isComplete).toBe(true);
    });

    it('does NOT complete course when a required published assessment is not passed', async () => {
      // 2 total lessons, 2 completed lessons
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      // assessments query: 1 required assessment
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '501', title: 'Final Exam' }],
      });
      // assessment attempts: no passing attempt
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const evaluation = await evaluateCourseCompletion('1', '100', '20');
      expect(evaluation.isComplete).toBe(false);
      expect(evaluation.reason).toBe('REQUIRED_ASSESSMENT_NOT_PASSED');
    });

    it('marks course complete when all lessons are done AND required published assessment is passed', async () => {
      // 2 total lessons, 2 completed lessons
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      executeQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });
      // assessments query: 1 required assessment
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '501', title: 'Final Exam' }],
      });
      // assessment attempts: passed attempt found
      executeQuery.mockResolvedValueOnce({ rows: [{ id: '9001' }] });

      const evaluation = await evaluateCourseCompletion('1', '100', '20');
      expect(evaluation.isComplete).toBe(true);
    });
  });
});
