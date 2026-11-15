import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { executeQuery, withTransaction } = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-admin-tests-32-chars';
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
import { seedAdmin } from '../scripts/seed-admin.js';

const adminBasePath = `${env.apiPrefix}/admin/users`;
const authBasePath = `${env.apiPrefix}/auth`;
const createdAt = new Date('2026-11-14T09:00:00.000Z');

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

function mockUserRow(overrides = {}) {
  return {
    id: 1,
    full_name: 'System Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    approved_by: null,
    approved_at: createdAt,
    created_at: createdAt,
    ...overrides,
  };
}

function mockAuthAdmin(adminId = '1') {
  executeQuery.mockResolvedValueOnce({
    rows: [mockUserRow({ id: adminId, role: 'ADMIN', status: 'ACTIVE' })],
  });
}

function mockAuthTrainee(traineeId = '12') {
  executeQuery.mockResolvedValueOnce({
    rows: [mockUserRow({ id: traineeId, role: 'TRAINEE', status: 'ACTIVE' })],
  });
}

describe('Admin User Governance (/api/v1/admin/users)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authorization Guards', () => {
    it('forbids TRAINEE on all three endpoints (403 FORBIDDEN)', async () => {
      // 1. GET /admin/users
      mockAuthTrainee('12');
      const getRes = await request(app)
        .get(adminBasePath)
        .set('Authorization', `Bearer ${makeToken('12')}`);
      expect(getRes.status).toBe(403);
      expect(getRes.body.error.code).toBe('FORBIDDEN');

      // 2. PATCH /admin/users/:userId/status
      mockAuthTrainee('12');
      const patchStatusRes = await request(app)
        .patch(`${adminBasePath}/20/status`)
        .set('Authorization', `Bearer ${makeToken('12')}`)
        .send({ status: 'ACTIVE' });
      expect(patchStatusRes.status).toBe(403);
      expect(patchStatusRes.body.error.code).toBe('FORBIDDEN');

      // 3. PATCH /admin/users/:userId/role
      mockAuthTrainee('12');
      const patchRoleRes = await request(app)
        .patch(`${adminBasePath}/20/role`)
        .set('Authorization', `Bearer ${makeToken('12')}`)
        .send({ role: 'TRAINER' });
      expect(patchRoleRes.status).toBe(403);
      expect(patchRoleRes.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks admin from modifying their own status (403 FORBIDDEN)', async () => {
      mockAuthAdmin('1');
      const res = await request(app)
        .patch(`${adminBasePath}/1/status`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toMatch(/cannot.*own status/i);
      expect(withTransaction).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/admin/users', () => {
    it('applies filters, search escaping, pagination, and returns mapped users', async () => {
      mockAuthAdmin('1');

      // 1st query: count
      executeQuery.mockResolvedValueOnce({
        rows: [{ total: '2' }],
      });

      // 2nd query: rows
      executeQuery.mockResolvedValueOnce({
        rows: [
          mockUserRow({
            id: 20,
            full_name: 'Asha_Rao',
            email: 'asha@example.com',
            role: 'TRAINEE',
            status: 'PENDING',
            approved_by: null,
            approved_at: null,
            created_at: createdAt,
          }),
          mockUserRow({
            id: 21,
            full_name: 'Asha Two',
            email: 'asha2@example.com',
            role: 'TRAINEE',
            status: 'PENDING',
            approved_by: null,
            approved_at: null,
            created_at: createdAt,
          }),
        ],
      });

      const res = await request(app)
        .get(`${adminBasePath}?role=TRAINEE&status=PENDING&search=Asha_&page=1&pageSize=10`)
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        pageSize: 10,
        totalItems: 2,
        totalPages: 1,
      });

      // Check fields of mapped user
      const user = res.body.data.items[0];
      expect(user).toEqual({
        id: '20',
        fullName: 'Asha_Rao',
        email: 'asha@example.com',
        role: 'TRAINEE',
        status: 'PENDING',
        approvedBy: null,
        approvedAt: null,
        createdAt: createdAt.toISOString(),
      });
      expect(user).not.toHaveProperty('password_hash');
      expect(user).not.toHaveProperty('passwordHash');

      // Verify LIKE escaping in executeQuery parameters
      const countCall = executeQuery.mock.calls[1];
      const countParams = countCall[1];
      expect(countParams).toContain('TRAINEE');
      expect(countParams).toContain('PENDING');
      expect(countParams).toContain('%Asha\\_%');
    });

    it('rejects invalid filter values (400 VALIDATION_ERROR)', async () => {
      mockAuthAdmin('1');
      const res = await request(app)
        .get(`${adminBasePath}?role=SUPERADMIN`)
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');

      mockAuthAdmin('1');
      const resSize = await request(app)
        .get(`${adminBasePath}?pageSize=150`)
        .set('Authorization', `Bearer ${makeToken('1')}`);

      expect(resSize.status).toBe(400);
      expect(resSize.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/admin/users/:userId/status', () => {
    it('approves a PENDING TRAINEE and writes audit_logs in the same transaction', async () => {
      mockAuthAdmin('1');

      const clientQuery = vi
        .fn()
        // 1. SELECT FOR UPDATE
        .mockResolvedValueOnce({
          rows: [
            mockUserRow({
              id: 20,
              full_name: 'Pending Trainee',
              email: 'trainee@example.com',
              role: 'TRAINEE',
              status: 'PENDING',
              approved_by: null,
              approved_at: null,
            }),
          ],
        })
        // 2. UPDATE users
        .mockResolvedValueOnce({
          rows: [
            mockUserRow({
              id: 20,
              full_name: 'Pending Trainee',
              email: 'trainee@example.com',
              role: 'TRAINEE',
              status: 'ACTIVE',
              approved_by: 1,
              approved_at: createdAt,
            }),
          ],
        })
        // 3. INSERT audit_logs
        .mockResolvedValueOnce({ rows: [{ id: 101 }] });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .patch(`${adminBasePath}/20/status`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'ACTIVE', reason: 'Verification documents approved' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        id: '20',
        fullName: 'Pending Trainee',
        email: 'trainee@example.com',
        role: 'TRAINEE',
        status: 'ACTIVE',
        approvedBy: '1',
        approvedAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString(),
      });

      // Verify calls inside transaction
      expect(clientQuery).toHaveBeenCalledTimes(3);

      // Lock query
      expect(clientQuery.mock.calls[0][0]).toMatch(/FOR UPDATE/i);
      expect(clientQuery.mock.calls[0][1]).toEqual(['20']);

      // Update query sets approved_by and approved_at
      expect(clientQuery.mock.calls[1][0]).toMatch(/UPDATE users/i);
      expect(clientQuery.mock.calls[1][0]).toMatch(/approved_by/i);
      expect(clientQuery.mock.calls[1][1]).toEqual(['ACTIVE', '1', '20']);

      // Audit query
      const auditCall = clientQuery.mock.calls[2];
      expect(auditCall[0]).toMatch(/INSERT INTO audit_logs/i);
      expect(auditCall[1][0]).toBe('1');
      expect(auditCall[1][1]).toBe('USER_APPROVED');
      expect(auditCall[1][2]).toBe('20');
      const auditDetails = JSON.parse(auditCall[1][3]);
      expect(auditDetails).toEqual({
        previousStatus: 'PENDING',
        newStatus: 'ACTIVE',
        reason: 'Verification documents approved',
      });
      expect(JSON.stringify(auditDetails)).not.toMatch(/password|token|hash/i);
    });

    it('approves a PENDING TRAINER successfully', async () => {
      mockAuthAdmin('1');

      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            mockUserRow({
              id: 30,
              full_name: 'Pending Trainer',
              email: 'trainer@example.com',
              role: 'TRAINER',
              status: 'PENDING',
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            mockUserRow({
              id: 30,
              full_name: 'Pending Trainer',
              email: 'trainer@example.com',
              role: 'TRAINER',
              status: 'ACTIVE',
              approved_by: 1,
              approved_at: createdAt,
            }),
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 102 }] });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .patch(`${adminBasePath}/30/status`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('TRAINER');
      expect(res.body.data.user.status).toBe('ACTIVE');
      expect(res.body.data.user.approvedBy).toBe('1');
    });

    it('rejects invalid status transitions (409 INVALID_STATUS_TRANSITION)', async () => {
      mockAuthAdmin('1');

      const clientQuery = vi.fn().mockResolvedValueOnce({
        rows: [
          mockUserRow({
            id: 20,
            status: 'PENDING',
          }),
        ],
      });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      // PENDING cannot jump straight to SUSPENDED
      const res = await request(app)
        .patch(`${adminBasePath}/20/status`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(clientQuery).toHaveBeenCalledTimes(1); // Lock only, update aborted
    });

    it('returns 404 USER_NOT_FOUND when user does not exist', async () => {
      mockAuthAdmin('1');

      const clientQuery = vi.fn().mockResolvedValueOnce({ rows: [] });
      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .patch(`${adminBasePath}/999/status`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/admin/users/:userId/role', () => {
    it('updates role of a PENDING user and records audit row in the same transaction', async () => {
      mockAuthAdmin('1');

      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            mockUserRow({
              id: 20,
              role: 'TRAINEE',
              status: 'PENDING',
            }),
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            mockUserRow({
              id: 20,
              role: 'TRAINER',
              status: 'PENDING',
            }),
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 103 }] });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .patch(`${adminBasePath}/20/role`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ role: 'TRAINER' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('TRAINER');

      // Verify audit query inside transaction
      expect(clientQuery).toHaveBeenCalledTimes(3);
      const auditCall = clientQuery.mock.calls[2];
      expect(auditCall[1][1]).toBe('USER_ROLE_CHANGED');
      const details = JSON.parse(auditCall[1][3]);
      expect(details).toEqual({ previousRole: 'TRAINEE', newRole: 'TRAINER' });
    });

    it('rejects role change on an ACTIVE user (409 ROLE_CHANGE_NOT_ALLOWED)', async () => {
      mockAuthAdmin('1');

      const clientQuery = vi.fn().mockResolvedValueOnce({
        rows: [
          mockUserRow({
            id: 20,
            role: 'TRAINEE',
            status: 'ACTIVE',
          }),
        ],
      });

      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .patch(`${adminBasePath}/20/role`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ role: 'TRAINER' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ROLE_CHANGE_NOT_ALLOWED');
      expect(clientQuery).toHaveBeenCalledTimes(1);
    });

    it('rejects role assignment to ADMIN (400 VALIDATION_ERROR)', async () => {
      mockAuthAdmin('1');

      const res = await request(app)
        .patch(`${adminBasePath}/20/role`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(withTransaction).not.toHaveBeenCalled();
    });

    it('returns 404 USER_NOT_FOUND when user does not exist', async () => {
      mockAuthAdmin('1');

      const clientQuery = vi.fn().mockResolvedValueOnce({ rows: [] });
      withTransaction.mockImplementationOnce(async (work) => work({ query: clientQuery }));

      const res = await request(app)
        .patch(`${adminBasePath}/999/role`)
        .set('Authorization', `Bearer ${makeToken('1')}`)
        .send({ role: 'TRAINER' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('Post-Suspension Authenticate Enforcement', () => {
    it('rejects a suspended user on their next request to /auth/me (403 ACCOUNT_SUSPENDED)', async () => {
      const userToken = makeToken('50');

      // The user was suspended in DB; authenticate checks DB row on every request
      executeQuery.mockResolvedValueOnce({
        rows: [
          mockUserRow({
            id: 50,
            full_name: 'Suspended Trainee',
            email: 'suspended@example.com',
            role: 'TRAINEE',
            status: 'SUSPENDED',
          }),
        ],
      });

      const res = await request(app)
        .get(`${authBasePath}/me`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
      expect(res.body.error.message).toMatch(/suspended/i);
    });
  });

  describe('Admin Seeding (scripts/seed-admin.js)', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('fails with a descriptive error when required env vars are missing', async () => {
      delete process.env.ADMIN_EMAIL;
      delete process.env.ADMIN_PASSWORD;
      delete process.env.ADMIN_FULL_NAME;

      await expect(seedAdmin()).rejects.toThrow(/Missing required environment variable/i);
    });

    it('inserts an ACTIVE ADMIN when account does not exist', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      process.env.ADMIN_PASSWORD = 'SuperSecurePassw0rd!';
      process.env.ADMIN_FULL_NAME = 'Main Admin';

      // 1. check existing -> none
      executeQuery.mockResolvedValueOnce({ rows: [] });

      // 2. insert -> returns created
      executeQuery.mockResolvedValueOnce({
        rows: [
          mockUserRow({
            id: 1,
            full_name: 'Main Admin',
            email: 'admin@example.com',
            role: 'ADMIN',
            status: 'ACTIVE',
          }),
        ],
      });

      const user = await seedAdmin();
      expect(user.role).toBe('ADMIN');
      expect(user.status).toBe('ACTIVE');

      expect(executeQuery).toHaveBeenCalledTimes(2);
      const insertCall = executeQuery.mock.calls[1];
      expect(insertCall[0]).toMatch(/INSERT INTO users/i);
      expect(insertCall[1][0]).toBe('Main Admin');
      expect(insertCall[1][1]).toBe('admin@example.com');
      // Password hash must not be raw password
      expect(insertCall[1][2]).not.toBe('SuperSecurePassw0rd!');
      expect(insertCall[1][2]).toMatch(/^\$2[aby]\$/);
    });

    it('is idempotent when an account with the same email already exists in different case', async () => {
      process.env.ADMIN_EMAIL = '  ADMIN@Example.com ';
      process.env.ADMIN_PASSWORD = 'SuperSecurePassw0rd!';
      process.env.ADMIN_FULL_NAME = 'Main Admin';

      // check existing -> returns existing admin
      executeQuery.mockResolvedValueOnce({
        rows: [
          mockUserRow({
            id: 1,
            email: 'admin@example.com',
            role: 'ADMIN',
            status: 'ACTIVE',
          }),
        ],
      });

      const user = await seedAdmin();
      expect(user.id).toBe(1);
      expect(executeQuery).toHaveBeenCalledTimes(1); // No insert query made
      expect(executeQuery.mock.calls[0][1][0]).toBe('admin@example.com');
    });
  });
});
