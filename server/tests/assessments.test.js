import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-assessments-tests-32-chars';
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery, withTransaction } from '../src/config/db.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockAuthUser({
  id = '10',
  fullName = 'Trainer Bob',
  email = 'trainer@example.com',
  role = 'TRAINER',
  status = 'ACTIVE',
} = {}) {
  executeQuery.mockResolvedValueOnce({
    rows: [{ id, full_name: fullName, email, role, status }],
  });
}

function makeAssessmentRow(overrides = {}) {
  const now = new Date('2026-11-13T10:00:00.000Z');
  return {
    id: '1',
    course_id: '100',
    title: 'Synoptic Meteorology Quiz',
    instructions: 'Answer all questions carefully.',
    deadline_at: null,
    duration_minutes: 30,
    max_attempts: 1,
    pass_percentage: '60.00',
    is_required: true,
    status: 'DRAFT',
    published_at: null,
    created_at: now,
    updated_at: now,
    question_count: '2',
    total_points: '10',
    course_trainer_id: '10',
    course_status: 'PUBLISHED',
    course_title: 'Intro to Atmospheric Science',
    ...overrides,
  };
}

function makeQuestionRow(overrides = {}) {
  const now = new Date('2026-11-14T10:00:00.000Z');
  return {
    id: '101',
    assessment_id: '1',
    question_order: 1,
    question_text: 'What causes geostrophic wind?',
    option_a: 'Balance between Coriolis force and pressure gradient force',
    option_b: 'Frictional drag only',
    option_c: 'Centrifugal acceleration only',
    option_d: 'Thermal convection only',
    correct_option: 'A',
    explanation: 'Geostrophic balance occurs when Coriolis and pressure gradient forces are equal and opposite.',
    points: 2,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('Assessments API (/api/v1/courses/:courseId/assessments & /api/v1/assessments)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Auth & Role Guards', () => {
    it('rejects unauthenticated requests (401 UNAUTHENTICATED)', async () => {
      const res = await request(app).get('/api/v1/courses/100/assessments');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication token required',
        },
      });
    });

    it('rejects PENDING users (403 ACCOUNT_PENDING)', async () => {
      mockAuthUser({ id: '99', role: 'TRAINER', status: 'PENDING' });

      const res = await request(app)
        .get('/api/v1/courses/100/assessments')
        .set('Authorization', `Bearer ${makeToken('99')}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_PENDING');
    });

    it('forbids TRAINEE from creating assessments (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });

      const res = await request(app)
        .post('/api/v1/courses/100/assessments')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ title: 'Trainee Quiz' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/courses/:courseId/assessments (Create Assessment)', () => {
    it('allows course owner TRAINER to create an assessment (201 Created)', async () => {
      // 1. authenticate
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // 2. verifyCourseOwnership
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainer_id: '10', title: 'Intro to Atmospheric Science', status: 'DRAFT' }],
      });
      // 3. insert assessment
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_id: '100', title: 'Synoptic Meteorology Quiz' })],
      });

      const res = await request(app)
        .post('/api/v1/courses/100/assessments')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          title: 'Synoptic Meteorology Quiz',
          instructions: 'Answer all questions carefully.',
          durationMinutes: 30,
          passPercentage: 60,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assessment).toMatchObject({
        id: '1',
        courseId: '100',
        title: 'Synoptic Meteorology Quiz',
        status: 'DRAFT',
        durationMinutes: 30,
        passPercentage: 60,
        maxAttempts: 1,
        isRequired: true,
      });
    });

    it('allows ADMIN to create an assessment on any course (201 Created)', async () => {
      mockAuthUser({ id: '999', role: 'ADMIN' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainer_id: '10', title: 'Atmospheric Science', status: 'DRAFT' }],
      });
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '2', course_id: '100' })],
      });

      const res = await request(app)
        .post('/api/v1/courses/100/assessments')
        .set('Authorization', `Bearer ${makeToken('999')}`)
        .send({ title: 'Admin Assessment' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assessment.id).toBe('2');
    });

    it('rejects TRAINER who does not own the course (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '55', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainer_id: '10', title: 'Other Trainer Course', status: 'DRAFT' }],
      });

      const res = await request(app)
        .post('/api/v1/courses/100/assessments')
        .set('Authorization', `Bearer ${makeToken('55')}`)
        .send({ title: 'Hijacked Quiz' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('only manage assessments for your own courses');
    });

    it('returns 404 when target course does not exist', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/courses/9999/assessments')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ title: 'Orphan Quiz' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('COURSE_NOT_FOUND');
    });

    it('rejects invalid payload (empty title, invalid pass percentage) with 400 VALIDATION_ERROR', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });

      const res = await request(app)
        .post('/api/v1/courses/100/assessments')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ title: '   ', passPercentage: 150 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/courses/:courseId/assessments (List Assessments)', () => {
    it('returns paginated assessments for course owner trainer', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // verifyCourseOwnership
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainer_id: '10', title: 'Atmospheric Science', status: 'PUBLISHED' }],
      });
      // count query
      executeQuery.mockResolvedValueOnce({ rows: [{ total_count: '1' }] });
      // list query
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', question_count: '5', total_points: '20' })],
      });

      const res = await request(app)
        .get('/api/v1/courses/100/assessments?page=1&pageSize=10')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({
        id: '1',
        courseId: '100',
        questionCount: 5,
        totalPoints: 20,
      });
      expect(res.body.data.pagination).toEqual({
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it('enforces that TRAINEE must be actively enrolled in course', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      // course query
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainer_id: '10', title: 'Atmospheric Science', status: 'PUBLISHED' }],
      });
      // enrollment query returns empty
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/courses/100/assessments')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_ENROLLED');
    });

    it('trainee only receives PUBLISHED assessments', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      // course query
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainer_id: '10', title: 'Atmospheric Science', status: 'PUBLISHED' }],
      });
      // enrollment query returns active enrollment
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '500', course_id: '100', trainee_id: '20', status: 'ACTIVE' }],
      });
      // count query
      executeQuery.mockResolvedValueOnce({ rows: [{ total_count: '1' }] });
      // list query
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', status: 'PUBLISHED' })],
      });

      const res = await request(app)
        .get('/api/v1/courses/100/assessments')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items[0].status).toBe('PUBLISHED');
    });
  });

  describe('GET /api/v1/assessments/:assessmentId (Get Assessment Details)', () => {
    it('returns assessment and full question bank with answer keys for TRAINER owner', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_id: '100', course_trainer_id: '10' })],
      });
      // questions query
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '101',
            assessment_id: '1',
            question_order: 1,
            question_text: 'What causes Coriolis force?',
            option_a: 'Earth rotation',
            option_b: 'Gravity',
            option_c: 'Solar wind',
            option_d: 'Tidal waves',
            correct_option: 'A',
            explanation: 'Earth rotation on its axis deflects moving air.',
            points: 2,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assessment.id).toBe('1');
      expect(res.body.data.questions[0]).toMatchObject({
        id: '101',
        correctOption: 'A',
        explanation: 'Earth rotation on its axis deflects moving air.',
      });
    });

    it('strips correctOption and explanation for TRAINEE caller', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      // findAssessmentWithCourse (published)
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', status: 'PUBLISHED', course_status: 'PUBLISHED' })],
      });
      // verifyCourseEnrollment: course check
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainer_id: '10', title: 'Atmospheric Science', status: 'PUBLISHED' }],
      });
      // verifyCourseEnrollment: enrollment check
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '500', course_id: '100', trainee_id: '20', status: 'ACTIVE' }],
      });
      // questions query
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '101',
            assessment_id: '1',
            question_order: 1,
            question_text: 'What causes Coriolis force?',
            option_a: 'Earth rotation',
            option_b: 'Gravity',
            option_c: 'Solar wind',
            option_d: 'Tidal waves',
            correct_option: 'A',
            explanation: 'Earth rotation on its axis deflects moving air.',
            points: 2,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const question = res.body.data.questions[0];
      expect(question.questionText).toBe('What causes Coriolis force?');
      expect(question.correctOption).toBeUndefined();
      expect(question.explanation).toBeUndefined();
    });

    it('rejects TRAINEE requesting DRAFT assessment (404 ASSESSMENT_NOT_FOUND)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', status: 'DRAFT' })],
      });

      const res = await request(app)
        .get('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ASSESSMENT_NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/assessments/:assessmentId (Update Assessment)', () => {
    it('updates title and instructions when no attempts exist', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: false
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: false }] });
      // update query
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', title: 'Updated Title' })],
      });

      const res = await request(app)
        .patch('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assessment.title).toBe('Updated Title');
    });

    it('enforces SCHEMA-M3-01: locks scoring/duration edits if attempts exist (409 ASSESSMENT_LOCKED)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: true (attempts exist!)
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: true }] });

      const res = await request(app)
        .patch('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ passPercentage: 50 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSESSMENT_LOCKED');
      expect(res.body.error.message).toContain('Cannot modify scoring or duration settings once attempts have been recorded');
    });

    it('allows updating non-scoring fields (title) even if attempts exist', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: true
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: true }] });
      // update query succeeds
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', title: 'Fixed Typo in Title' })],
      });

      const res = await request(app)
        .patch('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ title: 'Fixed Typo in Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.assessment.title).toBe('Fixed Typo in Title');
    });

    it('rejects setting status to PUBLISHED via PATCH (requires /publish endpoint)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });

      const res = await request(app)
        .patch('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ status: 'PUBLISHED' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/assessments/:assessmentId/publish (Publish Assessment)', () => {
    it('rejects publishing empty assessment with 0 questions (409 ASSESSMENT_EMPTY)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      withTransaction.mockImplementationOnce(async (callback) => {
        const mockClient = { query: vi.fn() };
        // 1. findAssessmentWithCourse
        mockClient.query.mockResolvedValueOnce({
          rows: [makeAssessmentRow({ id: '1', status: 'DRAFT', course_trainer_id: '10' })],
        });
        // 2. question count check (0 questions!)
        mockClient.query.mockResolvedValueOnce({
          rows: [{ question_count: '0', total_points: '0' }],
        });
        return callback(mockClient);
      });

      const res = await request(app)
        .post('/api/v1/assessments/1/publish')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSESSMENT_EMPTY');
    });

    it('rejects publishing assessment that is not in DRAFT status (409 INVALID_STATUS_TRANSITION)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      withTransaction.mockImplementationOnce(async (callback) => {
        const mockClient = { query: vi.fn() };
        mockClient.query.mockResolvedValueOnce({
          rows: [makeAssessmentRow({ id: '1', status: 'PUBLISHED', course_trainer_id: '10' })],
        });
        return callback(mockClient);
      });

      const res = await request(app)
        .post('/api/v1/assessments/1/publish')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('successfully publishes DRAFT assessment when questions exist (200 OK)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      const now = new Date();
      withTransaction.mockImplementationOnce(async (callback) => {
        const mockClient = { query: vi.fn() };
        // 1. findAssessmentWithCourse
        mockClient.query.mockResolvedValueOnce({
          rows: [makeAssessmentRow({ id: '1', status: 'DRAFT', course_trainer_id: '10' })],
        });
        // 2. questions check (3 questions, 15 points)
        mockClient.query.mockResolvedValueOnce({
          rows: [{ question_count: '3', total_points: '15' }],
        });
        // 3. update query
        mockClient.query.mockResolvedValueOnce({
          rows: [makeAssessmentRow({ id: '1', status: 'PUBLISHED', published_at: now })],
        });
        return callback(mockClient);
      });

      const res = await request(app)
        .post('/api/v1/assessments/1/publish')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assessment.status).toBe('PUBLISHED');
      expect(res.body.data.assessment.publishedAt).toBeTruthy();
    });
  });

  describe('DELETE /api/v1/assessments/:assessmentId (Delete Assessment)', () => {
    it('rejects deleting assessment with existing attempts (409 ASSESSMENT_LOCKED)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: true
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: true }] });

      const res = await request(app)
        .delete('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSESSMENT_LOCKED');
      expect(res.body.error.message).toContain('Cannot delete assessment with recorded attempts');
    });

    it('successfully deletes unattempted assessment and cascades question deletion in transaction', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: false
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: false }] });
      // withTransaction
      withTransaction.mockImplementationOnce(async (callback) => {
        const mockClient = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
        return callback(mockClient);
      });

      const res = await request(app)
        .delete('/api/v1/assessments/1')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ deleted: true, id: '1' });
    });
  });

  describe('POST /api/v1/assessments/:assessmentId/questions (Create Question)', () => {
    it('allows course owner TRAINER to create an MCQ question (201 Created)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: false
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: false }] });
      // insert question
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101', question_order: 1 })],
      });

      const res = await request(app)
        .post('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          questionOrder: 1,
          questionText: 'What causes geostrophic wind?',
          optionA: 'Balance between Coriolis force and pressure gradient force',
          optionB: 'Frictional drag only',
          optionC: 'Centrifugal acceleration only',
          optionD: 'Thermal convection only',
          correctOption: 'A',
          explanation: 'Geostrophic balance occurs when Coriolis and pressure gradient forces are equal and opposite.',
          points: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.question).toMatchObject({
        id: '101',
        assessmentId: '1',
        questionOrder: 1,
        questionText: 'What causes geostrophic wind?',
        correctOption: 'A',
        points: 2,
      });
    });

    it('auto-computes questionOrder as MAX + 1 when omitted (SCHEMA-M3-02)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: false
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: false }] });
      // next order query
      executeQuery.mockResolvedValueOnce({ rows: [{ next_order: '4' }] });
      // insert question
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '104', question_order: 4 })],
      });

      const res = await request(app)
        .post('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          questionText: 'Fourth question text',
          optionA: 'A',
          optionB: 'B',
          optionC: 'C',
          optionD: 'D',
          correctOption: 'B',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.question.questionOrder).toBe(4);
    });

    it('rejects duplicate questionOrder with 409 DUPLICATE_QUESTION_ORDER', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: false
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: false }] });
      // insert throws unique violation on uq_questions_assessment_order
      const dbErr = new Error('duplicate key value violates unique constraint');
      dbErr.code = '23505';
      dbErr.constraint = 'uq_questions_assessment_order';
      executeQuery.mockRejectedValueOnce(dbErr);

      const res = await request(app)
        .post('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          questionOrder: 1,
          questionText: 'Duplicate question text',
          optionA: 'A',
          optionB: 'B',
          optionC: 'C',
          optionD: 'D',
          correctOption: 'C',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_QUESTION_ORDER');
    });

    it('rejects adding questions if assessment already has attempts (409 ASSESSMENT_LOCKED)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // hasAssessmentAttempts: true!
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: true }] });

      const res = await request(app)
        .post('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          questionText: 'Late question',
          optionA: 'A',
          optionB: 'B',
          optionC: 'C',
          optionD: 'D',
          correctOption: 'A',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSESSMENT_LOCKED');
    });

    it('forbids TRAINEE from creating questions (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });

      const res = await request(app)
        .post('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({
          questionText: 'Trainee question',
          optionA: 'A',
          optionB: 'B',
          optionC: 'C',
          optionD: 'D',
          correctOption: 'A',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects non-owner trainer from creating questions (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: '55', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });

      const res = await request(app)
        .post('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('55')}`)
        .send({
          questionText: 'Intruder question',
          optionA: 'A',
          optionB: 'B',
          optionC: 'C',
          optionD: 'D',
          correctOption: 'A',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/assessments/:assessmentId/questions (List Questions)', () => {
    it('returns questions with correctOption and explanation for TRAINER owner', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // questions query
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101' })],
      });

      const res = await request(app)
        .get('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({
        id: '101',
        correctOption: 'A',
        explanation: 'Geostrophic balance occurs when Coriolis and pressure gradient forces are equal and opposite.',
      });
    });

    it('strictly sanitizes questions for TRAINEE (strips correctOption and explanation)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      // findAssessmentWithCourse (PUBLISHED)
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', status: 'PUBLISHED', course_status: 'PUBLISHED' })],
      });
      // verifyCourseEnrollment: course check
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '100', trainer_id: '10', title: 'Atmospheric Science', status: 'PUBLISHED' }],
      });
      // verifyCourseEnrollment: enrollment check
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '500', course_id: '100', trainee_id: '20', status: 'ACTIVE' }],
      });
      // questions query
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101' })],
      });

      const res = await request(app)
        .get('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const question = res.body.data.items[0];
      expect(question.questionText).toBe('What causes geostrophic wind?');
      expect(question.correctOption).toBeUndefined();
      expect(question.explanation).toBeUndefined();
    });

    it('rejects TRAINEE requesting questions of DRAFT assessment (404 ASSESSMENT_NOT_FOUND)', async () => {
      mockAuthUser({ id: '20', role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', status: 'DRAFT' })],
      });

      const res = await request(app)
        .get('/api/v1/assessments/1/questions')
        .set('Authorization', `Bearer ${makeToken('20')}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ASSESSMENT_NOT_FOUND');
    });
  });

  describe('GET /api/v1/assessments/:assessmentId/questions/:questionId (Get Question)', () => {
    it('returns single question for course owner trainer', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // question query
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101' })],
      });

      const res = await request(app)
        .get('/api/v1/assessments/1/questions/101')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.question.id).toBe('101');
      expect(res.body.data.question.correctOption).toBe('A');
    });

    it('returns 404 QUESTION_NOT_FOUND when question does not exist', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // question query returns empty
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/assessments/1/questions/999')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('QUESTION_NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/assessments/:assessmentId/questions/:questionId (Update Question)', () => {
    it('allows trainer to update question text and options', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // question check
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101' })],
      });
      // hasAssessmentAttempts: false
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: false }] });
      // update query
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101', question_text: 'Updated question text' })],
      });

      const res = await request(app)
        .patch('/api/v1/assessments/1/questions/101')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ questionText: 'Updated question text' });

      expect(res.status).toBe(200);
      expect(res.body.data.question.questionText).toBe('Updated question text');
    });

    it('locks correctOption and points if attempts exist (409 ASSESSMENT_LOCKED)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // question check
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101', correct_option: 'A', points: 2 })],
      });
      // hasAssessmentAttempts: true!
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: true }] });

      const res = await request(app)
        .patch('/api/v1/assessments/1/questions/101')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ correctOption: 'B' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSESSMENT_LOCKED');
      expect(res.body.error.message).toContain('Cannot modify correct option or points once attempts have been recorded');
    });

    it('allows updating non-scoring fields (questionText) even if attempts exist', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // question check
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101', correct_option: 'A', points: 2 })],
      });
      // hasAssessmentAttempts: true
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: true }] });
      // update query succeeds
      executeQuery.mockResolvedValueOnce({
        rows: [makeQuestionRow({ id: '101', question_text: 'Fix minor typo' })],
      });

      const res = await request(app)
        .patch('/api/v1/assessments/1/questions/101')
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ questionText: 'Fix minor typo' });

      expect(res.status).toBe(200);
      expect(res.body.data.question.questionText).toBe('Fix minor typo');
    });
  });

  describe('DELETE /api/v1/assessments/:assessmentId/questions/:questionId (Delete Question)', () => {
    it('deletes question when no attempts exist', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // question check
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '101' }],
      });
      // hasAssessmentAttempts: false
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: false }] });
      // delete query
      executeQuery.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .delete('/api/v1/assessments/1/questions/101')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ deleted: true, id: '101' });
    });

    it('rejects deleting question if attempts exist (409 ASSESSMENT_LOCKED)', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // question check
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '101' }],
      });
      // hasAssessmentAttempts: true!
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: true }] });

      const res = await request(app)
        .delete('/api/v1/assessments/1/questions/101')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSESSMENT_LOCKED');
      expect(res.body.error.message).toContain('Cannot delete questions from an assessment with recorded attempts');
    });

    it('returns 404 QUESTION_NOT_FOUND when deleting non-existent question', async () => {
      mockAuthUser({ id: '10', role: 'TRAINER' });
      // findAssessmentWithCourse
      executeQuery.mockResolvedValueOnce({
        rows: [makeAssessmentRow({ id: '1', course_trainer_id: '10' })],
      });
      // question check returns empty
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete('/api/v1/assessments/1/questions/999')
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('QUESTION_NOT_FOUND');
    });
  });
});
