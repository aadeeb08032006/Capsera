import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

/**
 * Shared PostgreSQL connection pool using `pg` (node-postgres).
 *
 * Proposed Team Standard (see docs/DECISIONS.md — ADR-002):
 * - Required by faculty to replace MySQL with PostgreSQL while preserving `capsera_db`.
 * - Always use parameterized queries (`$1, $2, ...` placeholders) via `executeQuery` or `pool.query`.
 * - Never interpolate user-supplied strings directly into SQL statements.
 * - Configure session timezone to UTC (`-c timezone=UTC`) for consistent timestamp persistence.
 */
const poolConfig = env.db.connectionString
  ? {
      connectionString: env.db.connectionString,
      max: env.db.maxConnections,
      idleTimeoutMillis: env.db.idleTimeoutMs,
      connectionTimeoutMillis: env.db.connectionTimeoutMs,
      options: '-c timezone=UTC',
    }
  : {
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
      user: env.db.user,
      password: env.db.password,
      max: env.db.maxConnections,
      idleTimeoutMillis: env.db.idleTimeoutMs,
      connectionTimeoutMillis: env.db.connectionTimeoutMs,
      options: '-c timezone=UTC',
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[CAPSERA PostgreSQL Pool Error]:', err?.message || 'Unexpected idle client error');
});

/**
 * Execute a parameterized PostgreSQL query (`$1, $2, ...` placeholders).
 *
 * @param {string} text - Parameterized SQL statement with `$1, $2, ...` placeholders
 * @param {Array<unknown>} [params=[]] - Bound parameter values
 * @returns {Promise<pg.QueryResult>}
 */
export async function executeQuery(text, params = []) {
  return pool.query(text, params);
}

/**
 * Execute a callback inside a PostgreSQL transaction (`BEGIN` / `COMMIT` / `ROLLBACK`).
 * Required by PRD Section 8.3 for multi-write flows (e.g., assessment scoring, certificate issuance).
 *
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Lightweight connectivity check against the configured PostgreSQL database (`capsera_db`).
 *
 * @returns {Promise<{ connected: boolean, engine: string, database: string, errorCode?: string }>}
 */
export async function checkDatabaseConnection() {
  try {
    await pool.query('SELECT 1 AS ok');
    return {
      connected: true,
      engine: 'postgresql',
      database: env.db.database,
    };
  } catch (error) {
    return {
      connected: false,
      engine: 'postgresql',
      database: env.db.database,
      errorCode: error?.code || 'DB_CONNECTION_FAILED',
    };
  }
}
