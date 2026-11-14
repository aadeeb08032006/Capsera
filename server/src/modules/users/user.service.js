import { executeQuery, withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { mapAdminUser } from './mapAdminUser.js';

export function escapeLikeWildcards(str) {
  return str.replace(/([\\%_])/g, '\\$1');
}

export async function listUsers({ role, status, search, page = 1, pageSize = 20 }) {
  const conditions = [];
  const params = [];

  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (search && search.trim() !== '') {
    const escaped = `%${escapeLikeWildcards(search.trim())}%`;
    params.push(escaped);
    const paramIdx = params.length;
    conditions.push(`(LOWER(full_name) LIKE LOWER($${paramIdx}) ESCAPE '\\' OR LOWER(email) LIKE LOWER($${paramIdx}) ESCAPE '\\')`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS total FROM users ${whereClause}`;
  const countResult = await executeQuery(countSql, params);
  const totalItems = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);

  const offset = (page - 1) * pageSize;
  const dataParams = [...params, pageSize, offset];
  const dataSql = `
    SELECT id, full_name, email, role, status, approved_by, approved_at, created_at
    FROM users
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `;

  const dataResult = await executeQuery(dataSql, dataParams);
  const items = dataResult.rows.map(mapAdminUser);

  return { items, page, pageSize, totalItems };
}

const ALLOWED_STATUS_TRANSITIONS = {
  PENDING: {
    ACTIVE: 'USER_APPROVED',
    REJECTED: 'USER_REJECTED',
  },
  ACTIVE: {
    SUSPENDED: 'USER_SUSPENDED',
  },
  SUSPENDED: {
    ACTIVE: 'USER_REACTIVATED',
  },
};

export async function updateUserStatus({ targetUserId, newStatus, reason, adminUser }) {
  if (String(adminUser.id) === String(targetUserId)) {
    throw new AppError(403, 'FORBIDDEN', 'An admin cannot change their own status');
  }

  return withTransaction(async (client) => {
    const lockResult = await client.query(
      `SELECT id, full_name, email, role, status, approved_by, approved_at, created_at
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [targetUserId],
    );

    if (!lockResult.rows || lockResult.rows.length === 0) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const user = lockResult.rows[0];
    const eventType = ALLOWED_STATUS_TRANSITIONS[user.status]?.[newStatus];

    if (!eventType) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Invalid status transition from ${user.status} to ${newStatus}`,
      );
    }

    let updateResult;
    if (user.status === 'PENDING' && newStatus === 'ACTIVE') {
      updateResult = await client.query(
        `UPDATE users
         SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, full_name, email, role, status, approved_by, approved_at, created_at`,
        [newStatus, adminUser.id, targetUserId],
      );
    } else {
      updateResult = await client.query(
        `UPDATE users
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, full_name, email, role, status, approved_by, approved_at, created_at`,
        [newStatus, targetUserId],
      );
    }

    const details = {
      previousStatus: user.status,
      newStatus,
      ...(reason ? { reason: String(reason).slice(0, 500) } : {}),
    };

    await client.query(
      `INSERT INTO audit_logs (actor_user_id, event_type, target_entity, target_id, details)
       VALUES ($1, $2, 'users', $3, $4)`,
      [adminUser.id, eventType, targetUserId, JSON.stringify(details)],
    );

    return mapAdminUser(updateResult.rows[0]);
  });
}

export async function updateUserRole({ targetUserId, newRole, adminUser }) {
  return withTransaction(async (client) => {
    const lockResult = await client.query(
      `SELECT id, full_name, email, role, status, approved_by, approved_at, created_at
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [targetUserId],
    );

    if (!lockResult.rows || lockResult.rows.length === 0) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const user = lockResult.rows[0];

    if (user.status !== 'PENDING') {
      throw new AppError(
        409,
        'ROLE_CHANGE_NOT_ALLOWED',
        'Role changes are only permitted while the user is in PENDING status',
      );
    }

    if (!['TRAINEE', 'TRAINER'].includes(newRole)) {
      throw new AppError(
        409,
        'ROLE_CHANGE_NOT_ALLOWED',
        'Role can only be changed to TRAINEE or TRAINER',
      );
    }

    const updateResult = await client.query(
      `UPDATE users
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, full_name, email, role, status, approved_by, approved_at, created_at`,
      [newRole, targetUserId],
    );

    const details = {
      previousRole: user.role,
      newRole,
    };

    await client.query(
      `INSERT INTO audit_logs (actor_user_id, event_type, target_entity, target_id, details)
       VALUES ($1, $2, 'users', $3, $4)`,
      [adminUser.id, 'USER_ROLE_CHANGED', targetUserId, JSON.stringify(details)],
    );

    return mapAdminUser(updateResult.rows[0]);
  });
}
