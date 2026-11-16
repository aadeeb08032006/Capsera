import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const { withTransaction } = vi.hoisted(() => {
  process.env.JWT_SECRET = 'seed-demo-tests-secret-at-least-32-characters';
  process.env.BCRYPT_COST = '4';
  return { withTransaction: vi.fn() };
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  pool: { query: vi.fn(), end: vi.fn() },
  withTransaction,
  checkDatabaseConnection: vi.fn(),
}));

import { seedDemo } from '../scripts/seed-demo.js';

const savedEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  demoPassword: process.env.DEMO_PASSWORD,
  adminEmail: process.env.ADMIN_EMAIL,
};

describe('Demo account seed', () => {
  let logSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.DEMO_PASSWORD = 'DemoPassword2026';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (savedEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnvironment.nodeEnv;
    if (savedEnvironment.demoPassword === undefined) delete process.env.DEMO_PASSWORD;
    else process.env.DEMO_PASSWORD = savedEnvironment.demoPassword;
    if (savedEnvironment.adminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = savedEnvironment.adminEmail;
  });

  it('refuses to seed in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(seedDemo()).rejects.toThrow(/disabled.*production/i);
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('fails clearly when DEMO_PASSWORD is missing', async () => {
    delete process.env.DEMO_PASSWORD;
    await expect(seedDemo()).rejects.toThrow(/DEMO_PASSWORD is required/);
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('upserts nine synthetic users, fills five profile rows, hashes the password and does not log it', async () => {
    const userInserts = [];
    const traineeProfiles = [];
    const trainerProfiles = [];
    const query = vi.fn(async (sql, params = []) => {
      if (/SELECT id FROM users/.test(sql)) return { rows: [{ id: '1' }] };
      if (/INSERT INTO users/.test(sql)) {
        userInserts.push({ sql, params });
        return { rows: [{ id: String(userInserts.length + 1), role: params[3], status: params[4] }] };
      }
      if (/INSERT INTO trainee_profiles/.test(sql)) {
        traineeProfiles.push({ sql, params });
        return { rows: [] };
      }
      if (/INSERT INTO trainer_profiles/.test(sql)) {
        trainerProfiles.push({ sql, params });
        return { rows: [] };
      }
      throw new Error('Unexpected seed query');
    });
    withTransaction.mockImplementationOnce(async (work) => work({ query }));

    const result = await seedDemo();

    expect(result).toEqual({ userCount: 9 });
    expect(userInserts).toHaveLength(9);
    expect(traineeProfiles).toHaveLength(3);
    expect(trainerProfiles).toHaveLength(2);
    expect(userInserts.every(({ params }) => params[1].endsWith('@example.com'))).toBe(true);
    expect(userInserts.every(({ sql }) => /ON CONFLICT \(LOWER\(email\)\)/i.test(sql))).toBe(true);
    expect(userInserts.filter(({ params }) => params[3] === 'TRAINEE' && params[4] === 'ACTIVE')).toHaveLength(3);
    expect(userInserts.filter(({ params }) => params[3] === 'TRAINER' && params[4] === 'ACTIVE')).toHaveLength(2);
    expect(userInserts.filter(({ params }) => params[4] === 'PENDING')).toHaveLength(2);
    expect(userInserts.filter(({ params }) => params[4] === 'REJECTED')).toHaveLength(1);
    expect(userInserts.filter(({ params }) => params[4] === 'SUSPENDED')).toHaveLength(1);
    for (const { params } of userInserts) {
      expect(await bcrypt.compare('DemoPassword2026', params[2])).toBe(true);
      expect(params[5]).toBe(['ACTIVE', 'SUSPENDED'].includes(params[4]) ? '1' : null);
    }
    expect(logSpy).not.toHaveBeenCalled();
  });
});