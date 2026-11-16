import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { executeQuery, withTransaction } = vi.hoisted(() => {
  process.env.JWT_SECRET = 'prd-scenarios-tests-secret-at-least-32-chars';
  process.env.BCRYPT_COST = '4';
  return { executeQuery: vi.fn(), withTransaction: vi.fn() };
});

vi.mock('../src/config/db.js', () => ({
  executeQuery,
  pool: { query: vi.fn() },
  withTransaction,
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';

const authPath = `${env.apiPrefix}/auth`;
const adminPath = `${env.apiPrefix}/admin/users`;
const profilePath = `${env.apiPrefix}/profiles/me`;
const createdAt = new Date('2026-11-16T10:00:00.000Z');

function makeToken(id) {
  return jwt.sign({ sub: String(id) }, env.jwtSecret, { expiresIn: '1h' });
}

function row({ id = 2, fullName = 'Test User', role = 'TRAINEE', status = 'ACTIVE', ...extra } = {}) {
  return {
    id,
    full_name: fullName,
    email: `${String(fullName).toLowerCase().replaceAll(' ', '.')}@example.com`,
    role,
    status,
    approved_by: null,
    approved_at: null,
    created_at: createdAt,
    ...extra,
  };
}

function mockAuth(user) {
  executeQuery.mockResolvedValueOnce({ rows: [user] });
}

function mockTransaction(query) {
  withTransaction.mockImplementationOnce(async (work) => work({ query }));
}

describe('PRD Member 1 scenarios', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Scenario 1: a PENDING user cannot log in or call a protected API with a valid token', async () => {
    const pending = row({ status: 'PENDING', password_hash: await bcrypt.hash('Passw0rdX', 4) });
    executeQuery.mockResolvedValueOnce({ rows: [pending] });
    const login = await request(app).post(`${authPath}/login`).send({
      email: pending.email,
      password: 'Passw0rdX',
    });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_PENDING');

    mockAuth(row({ status: 'PENDING' }));
    const protectedResponse = await request(app)
      .get(profilePath)
      .set('Authorization', `Bearer ${makeToken(2)}`);
    expect(protectedResponse.status).toBe(403);
    expect(protectedResponse.body.error.code).toBe('ACCOUNT_PENDING');
  });

  it('Scenario 2: an admin approves a trainee and trainer, and both can then log in', async () => {
    const password = 'Passw0rdX';
    const passwordHash = await bcrypt.hash(password, 4);
    for (const [id, role] of [[20, 'TRAINEE'], [21, 'TRAINER']]) {
      mockAuth(row({ id: 1, fullName: 'System Admin', role: 'ADMIN' }));
      const target = row({ id, fullName: `${role} User`, role, status: 'PENDING' });
      const clientQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [target] })
        .mockResolvedValueOnce({ rows: [{ ...target, status: 'ACTIVE', approved_by: 1, approved_at: createdAt }] })
        .mockResolvedValueOnce({ rows: [{ id: 100 + id }] });
      mockTransaction(clientQuery);

      const approved = await request(app)
        .patch(`${adminPath}/${id}/status`)
        .set('Authorization', `Bearer ${makeToken(1)}`)
        .send({ status: 'ACTIVE' });
      expect(approved.status).toBe(200);
      expect(approved.body.data.user.status).toBe('ACTIVE');
      expect(approved.body.data.user.role).toBe(role);

      executeQuery.mockResolvedValueOnce({
        rows: [{ ...target, status: 'ACTIVE', password_hash: passwordHash }],
      });
      const login = await request(app).post(`${authPath}/login`).send({ email: target.email, password });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe(role);
      expect(login.body.data.user.status).toBe('ACTIVE');
    }
  });

  it('Scenario 3: a trainee cannot self-assign ADMIN, change any role, or access /admin endpoints', async () => {
    const signup = await request(app).post(`${authPath}/signup`).send({
      fullName: 'Trainee User',
      email: 'trainee@example.com',
      password: 'Passw0rdX',
      role: 'ADMIN',
    });
    expect(signup.status).toBe(400);
    expect(signup.body.error.code).toBe('VALIDATION_ERROR');

    const trainee = row({ id: 10, fullName: 'Active Trainee', role: 'TRAINEE' });
    const protectedAdminRequests = [
      () => request(app).get(adminPath),
      () => request(app).patch(`${adminPath}/10/role`).send({ role: 'TRAINER' }),
      () => request(app).patch(`${adminPath}/20/role`).send({ role: 'TRAINER' }),
      () => request(app).post(`${adminPath}/20/reset-password`),
      () => request(app).get(`${env.apiPrefix}/admin/dashboard/summary`),
      () => request(app).get(`${env.apiPrefix}/admin/dashboard/assessment-performance`),
    ];

    for (const sendRequest of protectedAdminRequests) {
      mockAuth(trainee);
      const response = await sendRequest().set('Authorization', `Bearer ${makeToken(10)}`);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('Scenario 4: a SUSPENDED user token stops working on the next protected request', async () => {
    mockAuth(row({ id: 30, role: 'TRAINER', status: 'SUSPENDED' }));
    const response = await request(app)
      .get(`${authPath}/me`)
      .set('Authorization', `Bearer ${makeToken(30)}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('Scenario 5: profile updates use the authenticated user id, not a body user id', async () => {
    mockAuth(row({ id: 10, fullName: 'Profile Owner', role: 'TRAINEE' }));
    executeQuery.mockResolvedValueOnce({ rows: [{
      id: 4,
      user_id: 10,
      headline: 'Owner profile',
      organization: null,
      biography: null,
      qualifications: null,
      work_experience: null,
      interests: null,
      external_certifications: null,
      created_at: createdAt,
      updated_at: createdAt,
    }] });

    const response = await request(app)
      .put(`${profilePath}/trainee`)
      .set('Authorization', `Bearer ${makeToken(10)}`)
      .send({ headline: 'Owner profile', userId: '999', user_id: '998' });

    expect(response.status).toBe(200);
    expect(executeQuery.mock.calls[1][1][0]).toBe('10');
    expect(response.body.data.profile.userId).toBe('10');
  });
});