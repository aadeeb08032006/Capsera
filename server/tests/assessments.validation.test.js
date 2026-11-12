import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-assessments-validation-32';
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import { executeQuery } from '../src/config/db.js';
import { AppError } from '../src/shared/AppError.js';
import {
  courseIdParamSchema,
  createAssessmentBodySchema,
  updateAssessmentBodySchema,
  listAssessmentsQuerySchema,
  createQuestionBodySchema,
  updateQuestionBodySchema,
  submitAttemptBodySchema,
  parseWithSchema,
} from '../src/modules/assessments/assessment.validation.js';
import {
  verifyCourseOwnership,
  verifyCourseEnrollment,
  findAssessmentWithCourse,
  hasAssessmentAttempts,
} from '../src/modules/assessments/assessment.auth.js';

describe('Assessment Validation Schemas (Zod)', () => {
  describe('courseIdParamSchema & positiveIdSchema', () => {
    it('accepts valid positive bigint string IDs', () => {
      const parsed = parseWithSchema(courseIdParamSchema, { courseId: '42' });
      expect(parsed.courseId).toBe('42');
    });

    it('rejects zero, negative, or non-numeric IDs with 400 VALIDATION_ERROR', () => {
      for (const badId of ['0', '-5', 'abc', '12.5', '']) {
        expect(() => parseWithSchema(courseIdParamSchema, { courseId: badId })).toThrow(AppError);
        try {
          parseWithSchema(courseIdParamSchema, { courseId: badId });
        } catch (err) {
          expect(err.statusCode).toBe(400);
          expect(err.code).toBe('VALIDATION_ERROR');
        }
      }
    });
  });

  describe('createAssessmentBodySchema', () => {
    it('applies schema defaults matching migration 004 when only title is sent', () => {
      const data = parseWithSchema(createAssessmentBodySchema, { title: 'Unit 1 Quiz' });
      expect(data).toEqual({
        title: 'Unit 1 Quiz',
        maxAttempts: 1,
        passPercentage: 60,
        isRequired: true,
      });
    });

    it('accepts full valid assessment settings and normalizes deadlineAt to ISO UTC', () => {
      const data = parseWithSchema(createAssessmentBodySchema, {
        title: '  Midterm Quiz  ',
        instructions: 'Read carefully.',
        deadlineAt: '2026-12-01T18:30:00Z',
        durationMinutes: 45,
        maxAttempts: 3,
        passPercentage: 75.5,
        isRequired: false,
      });

      expect(data.title).toBe('Midterm Quiz');
      expect(data.deadlineAt).toBe('2026-12-01T18:30:00.000Z');
      expect(data.durationMinutes).toBe(45);
      expect(data.maxAttempts).toBe(3);
      expect(data.passPercentage).toBe(75.5);
      expect(data.isRequired).toBe(false);
    });

    it('rejects unknown fields via strictObject', () => {
      expect(() =>
        parseWithSchema(createAssessmentBodySchema, { title: 'Quiz', status: 'PUBLISHED' }),
      ).toThrow(AppError);
    });

    it('rejects passPercentage <= 0 or > 100 per chk_assessments_pass_percentage', () => {
      expect(() =>
        parseWithSchema(createAssessmentBodySchema, { title: 'Quiz', passPercentage: 0 }),
      ).toThrow(AppError);
      expect(() =>
        parseWithSchema(createAssessmentBodySchema, { title: 'Quiz', passPercentage: -5 }),
      ).toThrow(AppError);
      expect(() =>
        parseWithSchema(createAssessmentBodySchema, { title: 'Quiz', passPercentage: 100.01 }),
      ).toThrow(AppError);
    });

    it('rejects durationMinutes < 1 or maxAttempts < 1', () => {
      expect(() =>
        parseWithSchema(createAssessmentBodySchema, { title: 'Quiz', durationMinutes: 0 }),
      ).toThrow(AppError);
      expect(() =>
        parseWithSchema(createAssessmentBodySchema, { title: 'Quiz', maxAttempts: 0 }),
      ).toThrow(AppError);
    });

    it('rejects invalid deadlineAt date strings', () => {
      expect(() =>
        parseWithSchema(createAssessmentBodySchema, { title: 'Quiz', deadlineAt: 'not-a-date' }),
      ).toThrow(AppError);
    });
  });

  describe('updateAssessmentBodySchema & listAssessmentsQuerySchema', () => {
    it('rejects empty update body', () => {
      expect(() => parseWithSchema(updateAssessmentBodySchema, {})).toThrow(AppError);
    });

    it('allows closing an assessment via PATCH but rejects setting DRAFT/PUBLISHED directly', () => {
      const closed = parseWithSchema(updateAssessmentBodySchema, { status: 'CLOSED' });
      expect(closed.status).toBe('CLOSED');

      expect(() =>
        parseWithSchema(updateAssessmentBodySchema, { status: 'PUBLISHED' }),
      ).toThrow(AppError);
    });

    it('parses pagination defaults and caps pageSize at 100', () => {
      const defaults = parseWithSchema(listAssessmentsQuerySchema, {});
      expect(defaults).toEqual({ page: 1, pageSize: 20 });

      expect(() =>
        parseWithSchema(listAssessmentsQuerySchema, { pageSize: '101' }),
      ).toThrow(AppError);
    });
  });

  describe('createQuestionBodySchema & updateQuestionBodySchema', () => {
    const validQuestion = {
      questionText: 'Which PostgreSQL port is standard?',
      optionA: '3306',
      optionB: '5432',
      optionC: '27017',
      optionD: '6379',
      correctOption: 'B',
      explanation: '5432 is the default PostgreSQL port.',
      points: 2,
      questionOrder: 1,
    };

    it('validates a complete MCQ question and defaults points to 1 if omitted', () => {
      const { points: _p, ...minimal } = validQuestion;
      const parsed = parseWithSchema(createQuestionBodySchema, minimal);
      expect(parsed.points).toBe(1);
      expect(parsed.correctOption).toBe('B');
    });

    it('rejects options outside A, B, C, D or blank option text', () => {
      expect(() =>
        parseWithSchema(createQuestionBodySchema, { ...validQuestion, correctOption: 'E' }),
      ).toThrow(AppError);
      expect(() =>
        parseWithSchema(createQuestionBodySchema, { ...validQuestion, optionC: '   ' }),
      ).toThrow(AppError);
      expect(() =>
        parseWithSchema(createQuestionBodySchema, { ...validQuestion, points: 0 }),
      ).toThrow(AppError);
    });

    it('requires at least one field on question update', () => {
      expect(() => parseWithSchema(updateQuestionBodySchema, {})).toThrow(AppError);
      const updated = parseWithSchema(updateQuestionBodySchema, { points: 5 });
      expect(updated.points).toBe(5);
    });
  });

  describe('submitAttemptBodySchema', () => {
    it('accepts valid answers including null for skipped questions', () => {
      const parsed = parseWithSchema(submitAttemptBodySchema, {
        answers: [
          { questionId: '1', selectedOption: 'A' },
          { questionId: '2', selectedOption: null },
        ],
      });
      expect(parsed.answers).toHaveLength(2);
    });

    it('rejects duplicate questionId entries or invalid options', () => {
      expect(() =>
        parseWithSchema(submitAttemptBodySchema, {
          answers: [
            { questionId: '1', selectedOption: 'A' },
            { questionId: '1', selectedOption: 'B' },
          ],
        }),
      ).toThrow(AppError);

      expect(() =>
        parseWithSchema(submitAttemptBodySchema, {
          answers: [{ questionId: '1', selectedOption: 'Z' }],
        }),
      ).toThrow(AppError);
    });
  });
});

describe('Assessment Authorization & Domain Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyCourseOwnership', () => {
    const trainer = { id: '10', role: 'TRAINER', status: 'ACTIVE' };
    const otherTrainer = { id: '20', role: 'TRAINER', status: 'ACTIVE' };
    const admin = { id: '99', role: 'ADMIN', status: 'ACTIVE' };
    const trainee = { id: '5', role: 'TRAINEE', status: 'ACTIVE' };

    it('rejects TRAINEE role before querying DB', async () => {
      await expect(verifyCourseOwnership('1', trainee)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('throws 404 COURSE_NOT_FOUND when course does not exist', async () => {
      executeQuery.mockResolvedValueOnce({ rows: [] });
      await expect(verifyCourseOwnership('999', trainer)).rejects.toMatchObject({
        statusCode: 404,
        code: 'COURSE_NOT_FOUND',
      });
    });

    it('allows owning trainer and ADMIN, rejects non-owning trainer', async () => {
      const courseRow = { id: '1', trainer_id: '10', title: 'NWP Basics', status: 'DRAFT' };

      executeQuery.mockResolvedValueOnce({ rows: [courseRow] });
      await expect(verifyCourseOwnership('1', trainer)).resolves.toEqual(courseRow);

      executeQuery.mockResolvedValueOnce({ rows: [courseRow] });
      await expect(verifyCourseOwnership('1', admin)).resolves.toEqual(courseRow);

      executeQuery.mockResolvedValueOnce({ rows: [courseRow] });
      await expect(verifyCourseOwnership('1', otherTrainer)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('verifyCourseEnrollment', () => {
    it('throws 404 when course does not exist', async () => {
      executeQuery.mockResolvedValueOnce({ rows: [] });
      await expect(verifyCourseEnrollment('1', '5')).rejects.toMatchObject({
        statusCode: 404,
        code: 'COURSE_NOT_FOUND',
      });
    });

    it('throws 409 COURSE_NOT_PUBLISHED if course is DRAFT and requirePublishedCourse is true', async () => {
      executeQuery.mockResolvedValueOnce({
        rows: [{ id: '1', trainer_id: '10', title: 'NWP', status: 'DRAFT' }],
      });
      await expect(verifyCourseEnrollment('1', '5')).rejects.toMatchObject({
        statusCode: 409,
        code: 'COURSE_NOT_PUBLISHED',
      });
    });

    it('throws 403 NOT_ENROLLED if trainee has no enrollment row', async () => {
      executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: '1', trainer_id: '10', title: 'NWP', status: 'PUBLISHED' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await expect(verifyCourseEnrollment('1', '5')).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_ENROLLED',
      });
    });

    it('throws 403 ENROLLMENT_INACTIVE for CANCELLED enrollment and allows ACTIVE', async () => {
      executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: '1', trainer_id: '10', title: 'NWP', status: 'PUBLISHED' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: '77', course_id: '1', trainee_id: '5', status: 'CANCELLED' }],
        });

      await expect(verifyCourseEnrollment('1', '5')).rejects.toMatchObject({
        statusCode: 403,
        code: 'ENROLLMENT_INACTIVE',
      });

      executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: '1', trainer_id: '10', title: 'NWP', status: 'PUBLISHED' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: '77', course_id: '1', trainee_id: '5', status: 'ACTIVE' }],
        });

      const res = await verifyCourseEnrollment('1', '5');
      expect(res.enrollment.status).toBe('ACTIVE');
    });

    it('allows COMPLETED enrollment when explicitly permitted (e.g. feedback or history)', async () => {
      executeQuery
        .mockResolvedValueOnce({
          rows: [{ id: '1', trainer_id: '10', title: 'NWP', status: 'PUBLISHED' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: '77', course_id: '1', trainee_id: '5', status: 'COMPLETED' }],
        });

      const res = await verifyCourseEnrollment('1', '5', {
        allowedStatuses: ['ACTIVE', 'COMPLETED'],
      });
      expect(res.enrollment.status).toBe('COMPLETED');
    });
  });

  describe('findAssessmentWithCourse & hasAssessmentAttempts', () => {
    it('throws 404 ASSESSMENT_NOT_FOUND when missing and returns row when present', async () => {
      executeQuery.mockResolvedValueOnce({ rows: [] });
      await expect(findAssessmentWithCourse('999')).rejects.toMatchObject({
        statusCode: 404,
        code: 'ASSESSMENT_NOT_FOUND',
      });

      const row = { id: '3', course_id: '1', title: 'Quiz 1', course_trainer_id: '10' };
      executeQuery.mockResolvedValueOnce({ rows: [row] });
      await expect(findAssessmentWithCourse('3')).resolves.toEqual(row);
    });

    it('returns boolean from hasAssessmentAttempts', async () => {
      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: true }] });
      await expect(hasAssessmentAttempts('3')).resolves.toBe(true);

      executeQuery.mockResolvedValueOnce({ rows: [{ has_attempts: false }] });
      await expect(hasAssessmentAttempts('3')).resolves.toBe(false);
    });
  });
});
