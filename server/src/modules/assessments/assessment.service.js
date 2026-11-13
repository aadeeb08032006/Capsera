import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { ASSESSMENT_STATUSES, ENROLLMENT_STATUSES, ROLES } from '../../shared/constants.js';
import {
  findAssessmentWithCourse,
  hasAssessmentAttempts,
  runSql,
  verifyCourseEnrollment,
  verifyCourseOwnership,
} from './assessment.auth.js';

function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapAssessmentRow(row) {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    title: row.title,
    instructions: row.instructions ?? null,
    deadlineAt: row.deadline_at ? toIsoString(row.deadline_at) : null,
    durationMinutes:
      row.duration_minutes !== null && row.duration_minutes !== undefined
        ? Number(row.duration_minutes)
        : null,
    maxAttempts: Number(row.max_attempts),
    passPercentage: Number(row.pass_percentage),
    isRequired: Boolean(row.is_required),
    status: row.status,
    publishedAt: row.published_at ? toIsoString(row.published_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    ...(row.question_count !== undefined ? { questionCount: Number(row.question_count) } : {}),
    ...(row.total_points !== undefined ? { totalPoints: Number(row.total_points) } : {}),
  };
}

export function mapQuestionRow(row, role) {
  const isPrivileged = role === ROLES.TRAINER || role === ROLES.ADMIN;
  return {
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    questionOrder: Number(row.question_order),
    questionText: row.question_text,
    optionA: row.option_a,
    optionB: row.option_b,
    optionC: row.option_c,
    optionD: row.option_d,
    ...(isPrivileged ? { correctOption: row.correct_option } : {}),
    ...(isPrivileged ? { explanation: row.explanation ?? null } : {}),
    points: Number(row.points),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

/**
 * Create a new assessment in DRAFT status for a course.
 */
export async function createAssessment(courseId, payload, actor) {
  await verifyCourseOwnership(courseId, actor);

  const sql = `
    INSERT INTO assessments (
      course_id,
      title,
      instructions,
      deadline_at,
      duration_minutes,
      max_attempts,
      pass_percentage,
      is_required,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const params = [
    String(courseId),
    payload.title,
    payload.instructions ?? null,
    payload.deadlineAt ?? null,
    payload.durationMinutes ?? null,
    payload.maxAttempts ?? 1,
    payload.passPercentage ?? 60.0,
    payload.isRequired ?? true,
    ASSESSMENT_STATUSES.DRAFT,
  ];

  const result = await runSql(sql, params);
  return mapAssessmentRow(result.rows[0]);
}

/**
 * List assessments for a course with pagination and role-aware filtering.
 */
export async function listAssessmentsByCourse(courseId, query, actor) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  let effectiveStatus = query.status || null;

  if (actor.role === ROLES.TRAINEE) {
    await verifyCourseEnrollment(courseId, actor.id, {
      requirePublishedCourse: true,
      allowedStatuses: [ENROLLMENT_STATUSES.ACTIVE, ENROLLMENT_STATUSES.COMPLETED],
    });
    // Trainees are strictly restricted to published assessments
    effectiveStatus = ASSESSMENT_STATUSES.PUBLISHED;
  } else if (actor.role === ROLES.TRAINER) {
    await verifyCourseOwnership(courseId, actor);
  } else if (actor.role !== ROLES.ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied');
  }

  const countSql = `
    SELECT COUNT(id) AS total_count
    FROM assessments
    WHERE course_id = $1
      AND ($2::varchar IS NULL OR status = $2)
  `;
  const countRes = await runSql(countSql, [String(courseId), effectiveStatus]);
  const totalItems = Number(countRes.rows[0]?.total_count || 0);

  const listSql = `
    SELECT
      a.id,
      a.course_id,
      a.title,
      a.instructions,
      a.deadline_at,
      a.duration_minutes,
      a.max_attempts,
      a.pass_percentage,
      a.is_required,
      a.status,
      a.published_at,
      a.created_at,
      a.updated_at,
      COUNT(q.id) AS question_count,
      COALESCE(SUM(q.points), 0) AS total_points
    FROM assessments a
    LEFT JOIN questions q ON q.assessment_id = a.id
    WHERE a.course_id = $1
      AND ($2::varchar IS NULL OR a.status = $2)
    GROUP BY a.id
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT $3 OFFSET $4
  `;

  const listRes = await runSql(listSql, [
    String(courseId),
    effectiveStatus,
    pageSize,
    offset,
  ]);

  return {
    items: listRes.rows.map(mapAssessmentRow),
    page,
    pageSize,
    totalItems,
  };
}

/**
 * Fetch a single assessment by ID with its question bank (sanitized for trainees).
 */
export async function getAssessmentById(assessmentId, actor) {
  const assessment = await findAssessmentWithCourse(assessmentId);

  if (actor.role === ROLES.TRAINEE) {
    if (assessment.status !== ASSESSMENT_STATUSES.PUBLISHED) {
      throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');
    }
    await verifyCourseEnrollment(assessment.course_id, actor.id, {
      requirePublishedCourse: true,
      allowedStatuses: [ENROLLMENT_STATUSES.ACTIVE, ENROLLMENT_STATUSES.COMPLETED],
    });
  } else if (actor.role === ROLES.TRAINER) {
    if (actor.role !== ROLES.ADMIN && String(assessment.course_trainer_id) !== String(actor.id)) {
      throw new AppError(403, 'FORBIDDEN', 'You can only view assessments for your own courses');
    }
  } else if (actor.role !== ROLES.ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied');
  }

  const questionsSql = `
    SELECT
      id,
      assessment_id,
      question_order,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      explanation,
      points,
      created_at,
      updated_at
    FROM questions
    WHERE assessment_id = $1
    ORDER BY question_order ASC
  `;
  const questionsRes = await runSql(questionsSql, [String(assessmentId)]);

  return {
    assessment: mapAssessmentRow(assessment),
    questions: questionsRes.rows.map((row) => mapQuestionRow(row, actor.role)),
  };
}

/**
 * Update assessment metadata with attempt-locking safeguards (SCHEMA-M3-01).
 */
export async function updateAssessment(assessmentId, updates, actor) {
  const assessment = await findAssessmentWithCourse(assessmentId);

  if (actor.role !== ROLES.ADMIN && String(assessment.course_trainer_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only update assessments for your own courses');
  }

  const hasAttempts = await hasAssessmentAttempts(assessmentId);
  if (hasAttempts) {
    const isScoringOrDurationChanged =
      updates.passPercentage !== undefined ||
      updates.maxAttempts !== undefined ||
      updates.durationMinutes !== undefined ||
      updates.isRequired !== undefined;

    if (isScoringOrDurationChanged) {
      throw new AppError(
        409,
        'ASSESSMENT_LOCKED',
        'Cannot modify scoring or duration settings once attempts have been recorded',
      );
    }
  }

  if (updates.status !== undefined && updates.status !== ASSESSMENT_STATUSES.CLOSED) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Only status CLOSED can be set via PATCH');
  }

  const setClauses = [];
  const params = [String(assessmentId)];

  const addField = (column, value) => {
    params.push(value);
    setClauses.push(`${column} = $${params.length}`);
  };

  if (updates.title !== undefined) addField('title', updates.title);
  if (updates.instructions !== undefined) addField('instructions', updates.instructions);
  if (updates.deadlineAt !== undefined) addField('deadline_at', updates.deadlineAt);
  if (updates.durationMinutes !== undefined) addField('duration_minutes', updates.durationMinutes);
  if (updates.maxAttempts !== undefined) addField('max_attempts', updates.maxAttempts);
  if (updates.passPercentage !== undefined) addField('pass_percentage', updates.passPercentage);
  if (updates.isRequired !== undefined) addField('is_required', updates.isRequired);
  if (updates.status !== undefined) addField('status', updates.status);

  if (setClauses.length === 0) {
    return mapAssessmentRow(assessment);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const updateSql = `
    UPDATE assessments
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING *
  `;

  const result = await runSql(updateSql, params);
  return mapAssessmentRow(result.rows[0]);
}

/**
 * Publish a DRAFT assessment inside a transaction after verifying it contains questions.
 */
export async function publishAssessment(assessmentId, actor) {
  return await withTransaction(async (client) => {
    const assessment = await findAssessmentWithCourse(assessmentId, {
      forUpdate: true,
      client,
    });

    if (actor.role !== ROLES.ADMIN && String(assessment.course_trainer_id) !== String(actor.id)) {
      throw new AppError(403, 'FORBIDDEN', 'You can only publish assessments for your own courses');
    }

    if (assessment.status !== ASSESSMENT_STATUSES.DRAFT) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Only DRAFT assessments can be published; current status is ${assessment.status}`,
      );
    }

    const qCheck = await runSql(
      'SELECT COUNT(id) AS question_count, COALESCE(SUM(points), 0) AS total_points FROM questions WHERE assessment_id = $1',
      [String(assessmentId)],
      client,
    );

    const qCount = Number(qCheck.rows[0]?.question_count || 0);
    const totalPoints = Number(qCheck.rows[0]?.total_points || 0);

    if (qCount === 0 || totalPoints <= 0) {
      throw new AppError(
        409,
        'ASSESSMENT_EMPTY',
        'Assessment must have at least one question with positive points before publishing',
      );
    }

    const updateSql = `
      UPDATE assessments
      SET status = 'PUBLISHED',
          published_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const updateRes = await runSql(updateSql, [String(assessmentId)], client);
    return mapAssessmentRow(updateRes.rows[0]);
  });
}

/**
 * Delete an unattempted assessment and its questions inside a transaction.
 */
export async function deleteAssessment(assessmentId, actor) {
  const assessment = await findAssessmentWithCourse(assessmentId);

  if (actor.role !== ROLES.ADMIN && String(assessment.course_trainer_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only delete assessments for your own courses');
  }

  const hasAttempts = await hasAssessmentAttempts(assessmentId);
  if (hasAttempts) {
    throw new AppError(
      409,
      'ASSESSMENT_LOCKED',
      'Cannot delete assessment with recorded attempts. Close it instead.',
    );
  }

  return await withTransaction(async (client) => {
    // Satisfy FK RESTRICT by deleting child questions first
    await runSql('DELETE FROM questions WHERE assessment_id = $1', [String(assessmentId)], client);
    await runSql('DELETE FROM assessments WHERE id = $1', [String(assessmentId)], client);

    return { deleted: true, id: String(assessmentId) };
  });
}
