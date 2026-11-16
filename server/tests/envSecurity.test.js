import { afterEach, describe, expect, it, vi } from 'vitest';

const originalJwtSecret = process.env.JWT_SECRET;
const originalClientOrigin = process.env.CLIENT_ORIGIN;

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalClientOrigin === undefined) delete process.env.CLIENT_ORIGIN;
  else process.env.CLIENT_ORIGIN = originalClientOrigin;
  vi.resetModules();
});

describe('Security environment validation', () => {
  it('rejects a JWT_SECRET shorter than 32 characters at startup', async () => {
    process.env.JWT_SECRET = 'too-short';
    await expect(import('../src/config/env.js')).rejects.toThrow(/at least 32 characters/);
  });

  it('rejects a wildcard CLIENT_ORIGIN', async () => {
    process.env.JWT_SECRET = 'this-is-a-long-enough-test-secret-value';
    process.env.CLIENT_ORIGIN = '*';
    await expect(import('../src/config/env.js')).rejects.toThrow(/explicit origin/);
  });
});