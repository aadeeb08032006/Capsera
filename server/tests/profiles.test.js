import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { executeQuery, withTransaction } = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-profile-tests-32-chars';
  process.env.BCRYPT_COST = '4';
  return {
    executeQuery: vi.fn(),
    withTransaction: vi.fn(),
  };
});

vi.mock('../src/config/db.js', () => ({
  executeQuery,
  pool: { query: vi.fn() },
  withTransaction,
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';

const profilesBasePath = `${env.apiPrefix}/profiles`;
const createdAt = new Date('2026-11-16T09:00:00.000Z');
const updatedAt = new Date('2026-11-16T10:00:00.000Z');

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockUserRow(overrides = {}) {
  return {
    id: 10,
    full_name: 'Asha Rao',
    email: 'asha@example.com',
    role: 'TRAINEE',
    status: 'ACTIVE',
    created_at: createdAt,
    ...overrides,
  };
}

function mockAuthUser(overrides = {}) {
  executeQuery.mockResolvedValueOnce({
    rows: [mockUserRow(overrides)],
  });
}

describe('Profiles Module (/api/v1/profiles)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/profiles/me', () => {
    it('returns profile: null before first save for TRAINEE', async () => {
      mockAuthUser({ id: 10, role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`${profilesBasePath}/me`)
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        id: '10',
        fullName: 'Asha Rao',
        email: 'asha@example.com',
        role: 'TRAINEE',
      });
      expect(res.body.data.profile).toBeNull();

      expect(executeQuery).toHaveBeenCalledTimes(2);
      expect(executeQuery.mock.calls[1][0]).toMatch(/FROM trainee_profiles/i);
      expect(executeQuery.mock.calls[1][1]).toEqual(['10']);
    });

    it('returns saved profile for TRAINEE', async () => {
      mockAuthUser({ id: 10, role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 10,
            headline: 'Frontend Engineer',
            organization: 'Open Source',
            biography: 'Passionate about React.',
            qualifications: 'B.Tech',
            work_experience: '2 years at Startup',
            interests: 'Web development, UI/UX',
            external_certifications: 'Meta Frontend Certificate',
            created_at: createdAt,
            updated_at: updatedAt,
          },
        ],
      });

      const res = await request(app)
        .get(`${profilesBasePath}/me`)
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profile).toEqual({
        id: '1',
        userId: '10',
        headline: 'Frontend Engineer',
        organization: 'Open Source',
        biography: 'Passionate about React.',
        qualifications: 'B.Tech',
        workExperience: '2 years at Startup',
        interests: 'Web development, UI/UX',
        externalCertifications: 'Meta Frontend Certificate',
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
    });

    it('returns profile: null for ADMIN without querying profile tables', async () => {
      mockAuthUser({ id: 1, full_name: 'Admin User', role: 'ADMIN' });

      const res = await request(app)
        .get(`${profilesBasePath}/me`)
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.profile).toBeNull();
      // Only the auth lookup query should have been made
      expect(executeQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects a PENDING user token (403 ACCOUNT_PENDING)', async () => {
      executeQuery.mockResolvedValueOnce({
        rows: [mockUserRow({ id: 10, status: 'PENDING' })],
      });

      const res = await request(app)
        .get(`${profilesBasePath}/me`)
        .set('Authorization', `Bearer ${makeToken('10')}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_PENDING');
    });
  });

  describe('PUT /api/v1/profiles/me/trainee', () => {
    it('creates trainee profile on first save and updates on second save', async () => {
      // First save (create)
      mockAuthUser({ id: 10, role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 10,
            headline: 'Aspiring Web Developer',
            organization: 'Tech Academy',
            biography: 'Learning backend.',
            qualifications: 'B.Sc. CS',
            work_experience: 'Intern',
            interests: 'Cloud',
            external_certifications: 'AWS Cloud Practitioner',
            created_at: createdAt,
            updated_at: createdAt,
          },
        ],
      });

      const createRes = await request(app)
        .put(`${profilesBasePath}/me/trainee`)
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          headline: '  Aspiring Web Developer  ',
          organization: 'Tech Academy',
          biography: 'Learning backend.',
          qualifications: 'B.Sc. CS',
          workExperience: 'Intern',
          interests: 'Cloud',
          externalCertifications: 'AWS Cloud Practitioner',
        });

      expect(createRes.status).toBe(200);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.profile).toEqual({
        id: '1',
        userId: '10',
        headline: 'Aspiring Web Developer',
        organization: 'Tech Academy',
        biography: 'Learning backend.',
        qualifications: 'B.Sc. CS',
        workExperience: 'Intern',
        interests: 'Cloud',
        externalCertifications: 'AWS Cloud Practitioner',
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      });

      const upsertQuery = executeQuery.mock.calls[1];
      expect(upsertQuery[0]).toMatch(/INSERT INTO trainee_profiles/i);
      expect(upsertQuery[0]).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/i);
      expect(upsertQuery[0]).toMatch(/updated_at = CURRENT_TIMESTAMP/i);
      expect(upsertQuery[1][0]).toBe('10'); // user_id from req.user
      expect(upsertQuery[1][1]).toBe('Aspiring Web Developer'); // trimmed

      // Second save (update)
      mockAuthUser({ id: 10, role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 10,
            headline: 'Full-Stack Developer',
            organization: 'Tech Academy',
            biography: 'Learning backend.',
            qualifications: 'B.Sc. CS',
            work_experience: 'Intern',
            interests: 'Cloud',
            external_certifications: 'AWS Cloud Practitioner',
            created_at: createdAt,
            updated_at: updatedAt,
          },
        ],
      });

      const updateRes = await request(app)
        .put(`${profilesBasePath}/me/trainee`)
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          headline: 'Full-Stack Developer',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.profile.headline).toBe('Full-Stack Developer');
      expect(updateRes.body.data.profile.updatedAt).toBe(updatedAt.toISOString());
    });

    it('trims strings and converts empty strings to null', async () => {
      mockAuthUser({ id: 10, role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 10,
            headline: null,
            organization: null,
            biography: null,
            qualifications: null,
            work_experience: null,
            interests: null,
            external_certifications: null,
            created_at: createdAt,
            updated_at: createdAt,
          },
        ],
      });

      const res = await request(app)
        .put(`${profilesBasePath}/me/trainee`)
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          headline: '   ',
          organization: '',
        });

      expect(res.status).toBe(200);
      const params = executeQuery.mock.calls[1][1];
      expect(params[1]).toBeNull(); // headline converted to null
      expect(params[2]).toBeNull(); // organization converted to null
    });

    it('rejects unknown fields (400 VALIDATION_ERROR)', async () => {
      mockAuthUser({ id: 10, role: 'TRAINEE' });

      const res = await request(app)
        .put(`${profilesBasePath}/me/trainee`)
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          headline: 'Valid Headline',
          unknownField: 'malicious payload',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('ignores user_id in the request body and enforces req.user.id', async () => {
      mockAuthUser({ id: 10, role: 'TRAINEE' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 10,
            headline: 'Student',
            organization: null,
            biography: null,
            qualifications: null,
            work_experience: null,
            interests: null,
            external_certifications: null,
            created_at: createdAt,
            updated_at: createdAt,
          },
        ],
      });

      const res = await request(app)
        .put(`${profilesBasePath}/me/trainee`)
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({
          headline: 'Student',
          user_id: '99999',
          userId: '88888',
        });

      expect(res.status).toBe(200);
      const params = executeQuery.mock.calls[1][1];
      expect(params[0]).toBe('10'); // Must be 10 from req.user.id, not 99999 or 88888
    });

    it('forbids TRAINER from calling trainee PUT (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: 20, role: 'TRAINER' });

      const res = await request(app)
        .put(`${profilesBasePath}/me/trainee`)
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ headline: 'Trainer pretending to be Trainee' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PUT /api/v1/profiles/me/trainer', () => {
    it('creates/updates trainer profile and returns yearsOfExperience as a number', async () => {
      mockAuthUser({ id: 20, full_name: 'Dr. Vikram', role: 'TRAINER' });
      executeQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            user_id: 20,
            headline: 'Senior Meteorology Specialist',
            organization: 'IMD',
            biography: '20+ years researching synoptic meteorology.',
            qualifications: 'Ph.D. Atmospheric Sciences',
            work_experience: 'Lead Meteorologist',
            subject_expertise: 'Numerical Weather Prediction',
            years_of_experience: '15.5', // pg returns NUMERIC as string
            created_at: createdAt,
            updated_at: updatedAt,
          },
        ],
      });

      const res = await request(app)
        .put(`${profilesBasePath}/me/trainer`)
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({
          headline: 'Senior Meteorology Specialist',
          organization: 'IMD',
          biography: '20+ years researching synoptic meteorology.',
          qualifications: 'Ph.D. Atmospheric Sciences',
          workExperience: 'Lead Meteorologist',
          subjectExpertise: 'Numerical Weather Prediction',
          yearsOfExperience: 15.5,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile).toEqual({
        id: '2',
        userId: '20',
        headline: 'Senior Meteorology Specialist',
        organization: 'IMD',
        biography: '20+ years researching synoptic meteorology.',
        qualifications: 'Ph.D. Atmospheric Sciences',
        workExperience: 'Lead Meteorologist',
        subjectExpertise: 'Numerical Weather Prediction',
        yearsOfExperience: 15.5,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
      expect(typeof res.body.data.profile.yearsOfExperience).toBe('number');

      const upsertQuery = executeQuery.mock.calls[1];
      expect(upsertQuery[0]).toMatch(/INSERT INTO trainer_profiles/i);
      expect(upsertQuery[0]).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/i);
      expect(upsertQuery[1][0]).toBe('20');
      expect(upsertQuery[1][7]).toBe(15.5);
    });

    it('validates yearsOfExperience: rejects -1, 81, and non-number strings (400)', async () => {
      // Negative years
      mockAuthUser({ id: 20, role: 'TRAINER' });
      const negativeRes = await request(app)
        .put(`${profilesBasePath}/me/trainer`)
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ yearsOfExperience: -1 });

      expect(negativeRes.status).toBe(400);
      expect(negativeRes.body.error.code).toBe('VALIDATION_ERROR');

      // Above 80
      mockAuthUser({ id: 20, role: 'TRAINER' });
      const tooHighRes = await request(app)
        .put(`${profilesBasePath}/me/trainer`)
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ yearsOfExperience: 81 });

      expect(tooHighRes.status).toBe(400);
      expect(tooHighRes.body.error.code).toBe('VALIDATION_ERROR');

      // Non-numeric string
      mockAuthUser({ id: 20, role: 'TRAINER' });
      const stringRes = await request(app)
        .put(`${profilesBasePath}/me/trainer`)
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ yearsOfExperience: 'abc' });

      expect(stringRes.status).toBe(400);
      expect(stringRes.body.error.code).toBe('VALIDATION_ERROR');

      // More than one decimal place
      mockAuthUser({ id: 20, role: 'TRAINER' });
      const decimalRes = await request(app)
        .put(`${profilesBasePath}/me/trainer`)
        .set('Authorization', `Bearer ${makeToken('20')}`)
        .send({ yearsOfExperience: 5.55 });

      expect(decimalRes.status).toBe(400);
      expect(decimalRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('forbids TRAINEE from calling trainer PUT (403 FORBIDDEN)', async () => {
      mockAuthUser({ id: 10, role: 'TRAINEE' });

      const res = await request(app)
        .put(`${profilesBasePath}/me/trainer`)
        .set('Authorization', `Bearer ${makeToken('10')}`)
        .send({ headline: 'Trainee attempting to access trainer profile' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
