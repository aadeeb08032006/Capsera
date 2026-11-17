import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { executeQuery, withTransaction } = vi.hoisted(() => {
  process.env.JWT_SECRET = 'password-recovery-tests-secret-at-least-32-chars';
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
import { generateTemporaryPassword } from '../src/modules/users/user.service.js';

const server = express().use(app);
const adminPath = `${env.apiPrefix}/admin/users`;
const authPath = `${env.apiPrefix}/auth`;
const createdAt = new Date('2026-11-16T10:00:00.000Z');

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function userRow(overrides = {}) {
  return {
    id: 2,
    full_name: 'Asha Trainee',
    email: 'asha@example.com',
    role: 'TRAINEE',
    status: 'ACTIVE',
    approved_by: 1,
    approved_at: createdAt,
    created_at: createdAt,
    ...overrides,
  };
}

function authenticateAs(overrides = {}) {
  const row = userRow({ id: 1, full_name: 'System Admin', role: 'ADMIN', ...overrides });
  executeQuery.mockResolvedValueOnce({ rows: [row] });
  return row;
}

function setTransactionQueries(query) {
  withTransaction.mockImplementationOnce(async (work) => work({ query }));
}

function expectNoPasswordHash(response) {
  expect(response.text).not.toMatch(/password_hash|passwordHash/i);
}

describe('Password recovery and change endpoints', () => {
  let logSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('generates a 12-character temporary password meeting signup policy', () => {
    const temporaryPassword = generateTemporaryPassword();
    expect(temporaryPassword).toHaveLength(12);
    expect(temporaryPassword).toMatch(/[a-zA-Z]/);
    expect(temporaryPassword).toMatch(/[0-9]/);
  });

  it('allows ADMIN to reset an ACTIVE user, returns the password once, and does not log it', async () => {
    authenticateAs();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [userRow()] })
      .mockResolvedValueOnce({ rows: [userRow()] });
    setTransactionQueries(query);

    const response = await request(server)
      .post(`${adminPath}/2/reset-password`)
      .set('Authorization', `Bearer ${makeToken('1')}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.temporaryPassword).toMatch(/^(?=.*[a-zA-Z])(?=.*[0-9]).{12}$/);
    expect(response.body.data.user.id).toBe('2');
    expectNoPasswordHash(response);
    expect(logSpy).not.toHaveBeenCalled();

    const updateParams = query.mock.calls[1][1];
    expect(await bcrypt.compare('OldPassw0rd', updateParams[0])).toBe(false);
    expect(await bcrypt.compare(response.body.data.temporaryPassword, updateParams[0])).toBe(true);
    expect(query.mock.calls.some(([sql]) => /audit_logs/i.test(sql))).toBe(false);
  });

  it('forbids TRAINEE from resetting another user password', async () => {
    authenticateAs({ id: 9, role: 'TRAINEE' });
    const response = await request(server)
      .post(`${adminPath}/2/reset-password`)
      .set('Authorization', `Bearer ${makeToken('9')}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('rejects reset for a PENDING user with PASSWORD_RESET_NOT_ALLOWED', async () => {
    authenticateAs();
    setTransactionQueries(vi.fn().mockResolvedValueOnce({ rows: [userRow({ status: 'PENDING' })] }));
    const response = await request(server)
      .post(`${adminPath}/2/reset-password`)
      .set('Authorization', `Bearer ${makeToken('1')}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PASSWORD_RESET_NOT_ALLOWED');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('forbids ADMIN from resetting their own or another ADMIN password', async () => {
    authenticateAs();
    setTransactionQueries(vi.fn().mockResolvedValueOnce({ rows: [userRow({ id: 1, role: 'ADMIN' })] }));
    const selfResponse = await request(server)
      .post(`${adminPath}/1/reset-password`)
      .set('Authorization', `Bearer ${makeToken('1')}`);
    expect(selfResponse.status).toBe(403);
    expect(selfResponse.body.error.code).toBe('FORBIDDEN');

    authenticateAs();
    setTransactionQueries(vi.fn().mockResolvedValueOnce({ rows: [userRow({ id: 3, role: 'ADMIN' })] }));
    const otherAdminResponse = await request(server)
      .post(`${adminPath}/3/reset-password`)
      .set('Authorization', `Bearer ${makeToken('1')}`);
    expect(otherAdminResponse.status).toBe(403);
    expect(otherAdminResponse.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for an unknown reset target', async () => {
    authenticateAs();
    setTransactionQueries(vi.fn().mockResolvedValueOnce({ rows: [] }));
    const response = await request(server)
      .post(`${adminPath}/999/reset-password`)
      .set('Authorization', `Bearer ${makeToken('1')}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('changes password after verifying the current password and returns no hash', async () => {
    authenticateAs({ id: 2, role: 'TRAINEE' });
    const passwordHash = await bcrypt.hash('CurrentPass1', 4);
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ password_hash: passwordHash }] })
      .mockResolvedValueOnce({ rows: [] });
    setTransactionQueries(query);

    const response = await request(server)
      .post(`${authPath}/change-password`)
      .set('Authorization', `Bearer ${makeToken('2')}`)
      .send({ currentPassword: 'CurrentPass1', newPassword: 'NewPassword2' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ changed: true });
    expectNoPasswordHash(response);
    expect(await bcrypt.compare('CurrentPass1', query.mock.calls[1][1][0])).toBe(false);
    expect(await bcrypt.compare('NewPassword2', query.mock.calls[1][1][0])).toBe(true);
    expect(query.mock.calls.some(([sql]) => /audit_logs/i.test(sql))).toBe(false);
  });

  it('rejects a wrong current password with a generic error', async () => {
    authenticateAs({ id: 2, role: 'TRAINEE' });
    setTransactionQueries(vi.fn().mockResolvedValueOnce({
      rows: [{ password_hash: await bcrypt.hash('CurrentPass1', 4) }],
    }));
    const response = await request(server)
      .post(`${authPath}/change-password`)
      .set('Authorization', `Bearer ${makeToken('2')}`)
      .send({ currentPassword: 'WrongPass2', newPassword: 'NewPassword2' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(response.body.error.message).toBe('Current password is incorrect');
    expectNoPasswordHash(response);
  });

  it('rejects a weak new password and a password equal to the current password', async () => {
    authenticateAs({ id: 2, role: 'TRAINEE' });
    const weakResponse = await request(server)
      .post(`${authPath}/change-password`)
      .set('Authorization', `Bearer ${makeToken('2')}`)
      .send({ currentPassword: 'CurrentPass1', newPassword: 'weakpass' });
    expect(weakResponse.status).toBe(400);
    expect(weakResponse.body.error.code).toBe('VALIDATION_ERROR');
    expect(withTransaction).not.toHaveBeenCalled();

    authenticateAs({ id: 2, role: 'TRAINEE' });
    const sameResponse = await request(server)
      .post(`${authPath}/change-password`)
      .set('Authorization', `Bearer ${makeToken('2')}`)
      .send({ currentPassword: 'CurrentPass1', newPassword: 'CurrentPass1' });
    expect(sameResponse.status).toBe(400);
    expect(sameResponse.body.error.code).toBe('VALIDATION_ERROR');
    expect(withTransaction).not.toHaveBeenCalled();
  });
});