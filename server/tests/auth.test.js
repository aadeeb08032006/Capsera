import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { executeQuery } = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-auth-endpoint-tests';
  process.env.BCRYPT_COST = '4';
  return { executeQuery: vi.fn() };
});

vi.mock('../src/config/db.js', () => ({
  executeQuery,
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';

const basePath = `${env.apiPrefix}/auth`;
const validPassword = 'Passw0rdX';
const createdAt = new Date('2026-11-12T05:00:00.000Z');

function userRow(overrides = {}) {
  return {
    id: 12,
    full_name: 'Asha Rao',
    email: 'asha@example.com',
    password_hash: bcrypt.hashSync(validPassword, 4),
    role: 'TRAINEE',
    status: 'ACTIVE',
    created_at: createdAt,
    ...overrides,
  };
}

function testApp() {
  const testApp = express();
  testApp.use(app);
  return testApp;
}

describe('Auth endpoints', () => {
  const server = testApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects ADMIN signup with a readable validation error', async () => {
    const response = await request(server).post(`${basePath}/signup`).send({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      password: validPassword,
      role: 'ADMIN',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toMatch(/role/i);
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('rejects weak passwords', async () => {
    const noNumber = await request(server).post(`${basePath}/signup`).send({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      password: 'weakpass',
      role: 'TRAINEE',
    });

    expect(noNumber.status).toBe(400);
    expect(noNumber.body.error.code).toBe('VALIDATION_ERROR');
    expect(noNumber.body.error.message).toMatch(/number/i);

    const noLetter = await request(server).post(`${basePath}/signup`).send({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      password: '12345678',
      role: 'TRAINEE',
    });

    expect(noLetter.status).toBe(400);
    expect(noLetter.body.error.code).toBe('VALIDATION_ERROR');
    expect(noLetter.body.error.message).toMatch(/letter/i);

    const tooShort = await request(server).post(`${basePath}/signup`).send({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      password: 'Pass1',
      role: 'TRAINEE',
    });

    expect(tooShort.status).toBe(400);
    expect(tooShort.body.error.code).toBe('VALIDATION_ERROR');
    expect(tooShort.body.error.message).toMatch(/8 bytes/i);

    const tooLong = await request(server).post(`${basePath}/signup`).send({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      password: `P1${'a'.repeat(71)}`,
      role: 'TRAINEE',
    });

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_ERROR');
    expect(tooLong.body.error.message).toMatch(/72 bytes/i);
  });

  it('rejects unknown signup fields', async () => {
    const response = await request(server).post(`${basePath}/signup`).send({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      password: validPassword,
      role: 'TRAINEE',
      isAdmin: true,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('normalizes email and maps a case-insensitive duplicate to 409', async () => {
    executeQuery.mockRejectedValueOnce({ code: '23505' });
    const response = await request(server).post(`${basePath}/signup`).send({
      fullName: 'Asha Rao',
      email: '  Asha@Example.com ',
      password: validPassword,
      role: 'TRAINEE',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(executeQuery.mock.calls[0][1][1]).toBe('asha@example.com');
  });

  it('returns identical 401 errors for an unknown email and a wrong password', async () => {
    executeQuery.mockResolvedValueOnce({ rows: [userRow()] });
    const wrongPassword = await request(server).post(`${basePath}/login`).send({
      email: 'asha@example.com',
      password: 'WrongPass2',
    });

    executeQuery.mockResolvedValueOnce({ rows: [] });
    const unknownEmail = await request(server).post(`${basePath}/login`).send({
      email: 'unknown@example.com',
      password: 'WrongPass2',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a PENDING user after verifying the correct password', async () => {
    executeQuery.mockResolvedValueOnce({ rows: [userRow({ status: 'PENDING' })] });
    const response = await request(server).post(`${basePath}/login`).send({
      email: 'asha@example.com',
      password: validPassword,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_PENDING');

    executeQuery.mockResolvedValueOnce({ rows: [userRow({ status: 'REJECTED' })] });
    const rejected = await request(server).post(`${basePath}/login`).send({
      email: 'asha@example.com',
      password: validPassword,
    });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('ACCOUNT_REJECTED');

    executeQuery.mockResolvedValueOnce({ rows: [userRow({ status: 'SUSPENDED' })] });
    const suspended = await request(server).post(`${basePath}/login`).send({
      email: 'asha@example.com',
      password: validPassword,
    });
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rejects a PENDING user token on /auth/me', async () => {
    const token = jwt.sign({ sub: '12' }, env.jwtSecret, { expiresIn: '1h' });
    executeQuery.mockResolvedValueOnce({ rows: [userRow({ status: 'PENDING' })] });
    const response = await request(server)
      .get(`${basePath}/me`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_PENDING');

    executeQuery.mockResolvedValueOnce({ rows: [userRow({ status: 'REJECTED' })] });
    const rejected = await request(server)
      .get(`${basePath}/me`)
      .set('Authorization', `Bearer ${token}`);
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('ACCOUNT_REJECTED');

    executeQuery.mockResolvedValueOnce({ rows: [userRow({ status: 'SUSPENDED' })] });
    const suspended = await request(server)
      .get(`${basePath}/me`)
      .set('Authorization', `Bearer ${token}`);
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('logs in an ACTIVE user and returns the authenticated user from /auth/me', async () => {
    executeQuery.mockResolvedValueOnce({ rows: [userRow()] });
    const login = await request(server).post(`${basePath}/login`).send({
      email: '  ASHA@Example.com ',
      password: validPassword,
    });

    expect(login.status).toBe(200);
    expect(login.body.data.expiresIn).toBe(3600);
    expect(login.body.data.user).toEqual({
      id: '12',
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      role: 'TRAINEE',
      status: 'ACTIVE',
      createdAt: createdAt.toISOString(),
    });
    const loginQuery = executeQuery.mock.calls[0];
    expect(loginQuery[0]).toMatch(/LOWER\(email\)\s*=\s*LOWER\(\$1\)/i);
    expect(loginQuery[1][0]).toBe('asha@example.com');
    expect(jwt.decode(login.body.data.token)).toMatchObject({ sub: '12' });
    expect(Object.keys(jwt.decode(login.body.data.token)).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(login.text).not.toContain('passwordHash');
    expect(login.text).not.toContain(userRow().password_hash);

    executeQuery.mockResolvedValueOnce({ rows: [userRow()] });
    const me = await request(server)
      .get(`${basePath}/me`)
      .set('Authorization', `Bearer ${login.body.data.token}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user).toEqual(login.body.data.user);
    expect(me.text).not.toContain('passwordHash');
    expect(me.text).not.toContain(userRow().password_hash);
  });

  it('returns a password-free user on signup and does not issue a token', async () => {
    executeQuery.mockResolvedValueOnce({ rows: [userRow({ status: 'PENDING' })] });
    const response = await request(server).post(`${basePath}/signup`).send({
      fullName: 'Asha Rao',
      email: 'asha@example.com',
      password: validPassword,
      role: 'TRAINEE',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.status).toBe('PENDING');
    expect(response.body.data).not.toHaveProperty('token');
    expect(response.text).not.toContain('passwordHash');
    expect(response.text).not.toContain('password_hash');
  });

  it('enforces a 10kb JSON body limit on auth routes', async () => {
    const response = await request(server).post(`${basePath}/login`).send({
      email: 'asha@example.com',
      password: 'a'.repeat(11 * 1024),
    });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns the standard error envelope when signup is rate limited', async () => {
    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await request(server).post(`${basePath}/signup`).send({
          fullName: 'Asha Rao',
          email: 'asha@example.com',
          password: validPassword,
          role: 'ADMIN',
        }),
      );
    }

    const limited = responses.find((response) => response.status === 429);
    expect(limited).toBeDefined();
    expect(limited.body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
      },
    });
  });

  it('allows authenticated logout', async () => {
    const token = jwt.sign({ sub: '12' }, env.jwtSecret, { expiresIn: '1h' });
    executeQuery.mockResolvedValueOnce({ rows: [userRow()] });
    const response = await request(server)
      .post(`${basePath}/logout`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ loggedOut: true });
  });
});
