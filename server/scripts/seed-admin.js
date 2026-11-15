import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { executeQuery, pool } from '../src/config/db.js';

export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_FULL_NAME?.trim();

  const missing = [];
  if (!email) missing.push('ADMIN_EMAIL');
  if (!password) missing.push('ADMIN_PASSWORD');
  if (!fullName) missing.push('ADMIN_FULL_NAME');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s) for admin seed: ${missing.join(', ')}`);
  }

  const normalizedEmail = email.toLowerCase();

  const existingResult = await executeQuery(
    'SELECT id, full_name, email, role, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [normalizedEmail],
  );

  if (existingResult.rows.length > 0) {
    const existing = existingResult.rows[0];
    console.log(`[seed-admin] Admin account already exists (ID: ${existing.id}, Email: ${existing.email}, Role: ${existing.role}, Status: ${existing.status}). Skipping creation.`);
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptCost);

  const insertResult = await executeQuery(
    `INSERT INTO users (full_name, email, password_hash, role, status, approved_at)
     VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP)
     RETURNING id, full_name, email, role, status, created_at`,
    [fullName, normalizedEmail, passwordHash],
  );

  const created = insertResult.rows[0];
  console.log(`[seed-admin] Successfully created ACTIVE ADMIN user: ID=${created.id}, Email=${created.email}`);
  return created;
}

const isDirectRun = process.argv[1] && (process.argv[1].endsWith('seed-admin.js') || process.argv[1].endsWith('seed-admin'));

if (isDirectRun) {
  seedAdmin()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(`[seed-admin] Error: ${err.message}`);
      await pool.end();
      process.exit(1);
    });
}
