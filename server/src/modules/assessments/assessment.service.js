import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import {
  ASSESSMENT_STATUSES,
  ATTEMPT_STATUSES,
  COURSE_STATUSES,
  ENROLLMENT_STATUSES,
  ROLES,
} from '../../shared/constants.js';
import {
  findAssessmentWithCourse,
  hasAssessmentAttempts,
  runSql,
  verifyCourseEnrollment,
  verifyCourseOwnership,
} from './assessment.auth.js';
import { issueCertificateIfEligible } from '../certificates/certificates.service.js';

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

export function calculateAttemptExpiry(startedAt, durationMinutes, deadlineAt) {
  const startDate = startedAt instanceof Date ? startedAt : new Date(startedAt);
  let expiresAt = null;

  if (durationMinutes !== null && durationMinutes !== undefined) {
    expiresAt = new Date(startDate.getTime() + Number(durationMinutes) * 60 * 1000);
  }

  if (deadlineAt) {
    const deadlineDate = deadlineAt instanceof Date ? deadlineAt : new Date(deadlineAt);
    if (!expiresAt || deadlineDate < expiresAt) {
      expiresAt = deadlineDate;
    }
  }

  return expiresAt;
}

export function calculateRemainingSeconds(expiresAt, now = new Date()) {
  if (!expiresAt) return null;
  const targetDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const diffMs = targetDate.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

export function mapAttemptRow(row, assessment = null) {
  const startedAt = toIsoString(row.started_at);
  const submittedAt = toIsoString(row.submitted_at);
  const gradedAt = toIsoString(row.graded_at);
  const durationMinutes =
    row.duration_minutes !== undefined && row.duration_minutes !== null
      ? Number(row.duration_minutes)
      : assessment?.duration_minutes !== undefined && assessment?.duration_minutes !== null
        ? Number(assessment.duration_minutes)
        : assessment?.durationMinutes ?? null;
  const deadlineAt = row.deadline_at ?? assessment?.deadline_at ?? assessment?.deadlineAt ?? null;
  const expiresAt = calculateAttemptExpiry(row.started_at, durationMinutes, deadlineAt);

  return {
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    traineeId: String(row.trainee_id),
    attemptNumber: Number(row.attempt_number),
    status: row.status,
    startedAt,
    expiresAt: expiresAt ? toIsoString(expiresAt) : null,
    ...(durationMinutes !== null ? { durationMinutes } : {}),
    ...(submittedAt ? { submittedAt } : {}),
    ...(gradedAt ? { gradedAt } : {}),
    ...(row.earned_points !== null && row.earned_points !== undefined
      ? { earnedPoints: Number(row.earned_points) }
      : {}),
    ...(row.total_points !== null && row.total_points !== undefined
      ? { totalPoints: Number(row.total_points) }
      : {}),
    ...(row.score_percentage !== null && row.score_percentage !== undefined
      ? { scorePercentage: Number(row.score_percentage) }
      : {}),
    ...(row.is_passed !== null && row.is_passed !== undefined
      ? { isPassed: Boolean(row.is_passed) }
      : {}),
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

/**
 * Create a question in the assessment question bank.
 */
export async function createQuestion(assessmentId, payload, actor) {
  const assessment = await findAssessmentWithCourse(assessmentId);

  if (actor.role !== ROLES.ADMIN && String(assessment.course_trainer_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only add questions to your own courses');
  }

  const hasAttempts = await hasAssessmentAttempts(assessmentId);
  if (hasAttempts) {
    throw new AppError(
      409,
      'ASSESSMENT_LOCKED',
      'Cannot add questions to an assessment with recorded attempts',
    );
  }

  let questionOrder = payload.questionOrder;
  if (questionOrder === undefined || questionOrder === null) {
    const orderRes = await runSql(
      'SELECT COALESCE(MAX(question_order), 0) + 1 AS next_order FROM questions WHERE assessment_id = $1',
      [String(assessmentId)],
    );
    questionOrder = Number(orderRes.rows[0]?.next_order || 1);
  }

  const insertSql = `
    INSERT INTO questions (
      assessment_id,
      question_order,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      explanation,
      points
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const params = [
    String(assessmentId),
    questionOrder,
    payload.questionText,
    payload.optionA,
    payload.optionB,
    payload.optionC,
    payload.optionD,
    payload.correctOption,
    payload.explanation ?? null,
    payload.points ?? 1,
  ];

  const result = await runSql(insertSql, params);
  return mapQuestionRow(result.rows[0], actor.role);
}

/**
 * List questions in an assessment ordered by question_order (sanitized for trainees).
 */
export async function listQuestionsByAssessment(assessmentId, actor) {
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
      throw new AppError(403, 'FORBIDDEN', 'You can only view questions for your own courses');
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

  const result = await runSql(questionsSql, [String(assessmentId)]);
  return {
    items: result.rows.map((row) => mapQuestionRow(row, actor.role)),
  };
}

/**
 * Get a single question by assessment ID and question ID (sanitized for trainees).
 */
export async function getQuestionById(assessmentId, questionId, actor) {
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
      throw new AppError(403, 'FORBIDDEN', 'You can only view questions for your own courses');
    }
  } else if (actor.role !== ROLES.ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied');
  }

  const sql = `
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
    WHERE id = $1 AND assessment_id = $2
  `;

  const result = await runSql(sql, [String(questionId), String(assessmentId)]);
  if (!result.rows.length) {
    throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found in this assessment');
  }

  return {
    question: mapQuestionRow(result.rows[0], actor.role),
  };
}

/**
 * Update an existing question with attempt-locking safeguards.
 */
export async function updateQuestion(assessmentId, questionId, updates, actor) {
  const assessment = await findAssessmentWithCourse(assessmentId);

  if (actor.role !== ROLES.ADMIN && String(assessment.course_trainer_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only update questions for your own courses');
  }

  const qCheck = await runSql(
    'SELECT * FROM questions WHERE id = $1 AND assessment_id = $2',
    [String(questionId), String(assessmentId)],
  );
  if (!qCheck.rows.length) {
    throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found in this assessment');
  }
  const existingQuestion = qCheck.rows[0];

  const hasAttempts = await hasAssessmentAttempts(assessmentId);
  if (hasAttempts) {
    const isScoringChanged =
      (updates.correctOption !== undefined && updates.correctOption !== existingQuestion.correct_option) ||
      (updates.points !== undefined && Number(updates.points) !== Number(existingQuestion.points));

    if (isScoringChanged) {
      throw new AppError(
        409,
        'ASSESSMENT_LOCKED',
        'Cannot modify correct option or points once attempts have been recorded',
      );
    }
  }

  const setClauses = [];
  const params = [String(questionId), String(assessmentId)];

  const addField = (column, value) => {
    params.push(value);
    setClauses.push(`${column} = $${params.length}`);
  };

  if (updates.questionOrder !== undefined) addField('question_order', updates.questionOrder);
  if (updates.questionText !== undefined) addField('question_text', updates.questionText);
  if (updates.optionA !== undefined) addField('option_a', updates.optionA);
  if (updates.optionB !== undefined) addField('option_b', updates.optionB);
  if (updates.optionC !== undefined) addField('option_c', updates.optionC);
  if (updates.optionD !== undefined) addField('option_d', updates.optionD);
  if (updates.correctOption !== undefined) addField('correct_option', updates.correctOption);
  if (updates.explanation !== undefined) addField('explanation', updates.explanation);
  if (updates.points !== undefined) addField('points', updates.points);

  if (setClauses.length === 0) {
    return mapQuestionRow(existingQuestion, actor.role);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const updateSql = `
    UPDATE questions
    SET ${setClauses.join(', ')}
    WHERE id = $1 AND assessment_id = $2
    RETURNING *
  `;

  const result = await runSql(updateSql, params);
  return mapQuestionRow(result.rows[0], actor.role);
}

/**
 * Delete a question from an unattempted assessment.
 */
export async function deleteQuestion(assessmentId, questionId, actor) {
  const assessment = await findAssessmentWithCourse(assessmentId);

  if (actor.role !== ROLES.ADMIN && String(assessment.course_trainer_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only delete questions for your own courses');
  }

  const qCheck = await runSql(
    'SELECT id FROM questions WHERE id = $1 AND assessment_id = $2',
    [String(questionId), String(assessmentId)],
  );
  if (!qCheck.rows.length) {
    throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found in this assessment');
  }

  const hasAttempts = await hasAssessmentAttempts(assessmentId);
  if (hasAttempts) {
    throw new AppError(
      409,
      'ASSESSMENT_LOCKED',
      'Cannot delete questions from an assessment with recorded attempts',
    );
  }

  await runSql(
    'DELETE FROM questions WHERE id = $1 AND assessment_id = $2',
    [String(questionId), String(assessmentId)],
  );

  return { deleted: true, id: String(questionId) };
}

/**
 * Initiate an attempt session for an assessment (TRAINEE only).
 * Handles atomic checks: enrollment, course published, deadline, stale expiry, attempt limits.
 */
export async function startAttempt(assessmentId, actor) {
  if (actor.role !== ROLES.TRAINEE) {
    throw new AppError(403, 'FORBIDDEN', 'Only enrolled trainees can start assessment attempts');
  }

  const assessment = await findAssessmentWithCourse(assessmentId);

  if (assessment.status !== ASSESSMENT_STATUSES.PUBLISHED) {
    throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found');
  }

  if (assessment.course_status !== COURSE_STATUSES.PUBLISHED) {
    throw new AppError(409, 'COURSE_NOT_PUBLISHED', 'Course is not published');
  }

  await verifyCourseEnrollment(assessment.course_id, actor.id, {
    requirePublishedCourse: true,
    allowedStatuses: [ENROLLMENT_STATUSES.ACTIVE, ENROLLMENT_STATUSES.COMPLETED],
  });

  if (assessment.deadline_at) {
    const deadlineDate = new Date(assessment.deadline_at);
    if (new Date() > deadlineDate) {
      throw new AppError(409, 'DEADLINE_PASSED', 'Assessment submission deadline has passed');
    }
  }

  return await withTransaction(async (client) => {
    // Lock attempts for this trainee on this assessment to prevent concurrent race conditions
    const existingRes = await runSql(
      `SELECT id, status, started_at, attempt_number
       FROM assessment_attempts
       WHERE assessment_id = $1 AND trainee_id = $2
       ORDER BY attempt_number ASC
       FOR UPDATE`,
      [String(assessmentId), String(actor.id)],
      client,
    );

    const existingAttempts = existingRes.rows;

    for (const att of existingAttempts) {
      if (att.status === ATTEMPT_STATUSES.IN_PROGRESS) {
        const expiresAt = calculateAttemptExpiry(
          att.started_at,
          assessment.duration_minutes,
          assessment.deadline_at,
        );
        const now = new Date();
        if (expiresAt && now > expiresAt) {
          // Attempt has timed out: automatically expire it!
          await runSql(
            `UPDATE assessment_attempts
             SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [String(att.id)],
            client,
          );
          att.status = ATTEMPT_STATUSES.EXPIRED;
        } else {
          // Attempt is still actively running!
          throw new AppError(
            409,
            'ATTEMPT_IN_PROGRESS',
            'An attempt is already in progress for this assessment',
          );
        }
      }
    }

    if (existingAttempts.length >= Number(assessment.max_attempts)) {
      throw new AppError(
        409,
        'ATTEMPT_LIMIT_REACHED',
        'Maximum number of attempts reached for this assessment',
      );
    }

    const nextAttemptNumber = existingAttempts.length + 1;

    const insertSql = `
      INSERT INTO assessment_attempts (
        assessment_id,
        trainee_id,
        attempt_number,
        status,
        started_at
      ) VALUES ($1, $2, $3, 'IN_PROGRESS', CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const insertRes = await runSql(
      insertSql,
      [String(assessmentId), String(actor.id), nextAttemptNumber],
      client,
    );

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
        points,
        created_at,
        updated_at
      FROM questions
      WHERE assessment_id = $1
      ORDER BY question_order ASC
    `;

    const questionsRes = await runSql(questionsSql, [String(assessmentId)], client);

    return {
      attempt: mapAttemptRow(insertRes.rows[0], assessment),
      questions: questionsRes.rows.map((row) => mapQuestionRow(row, ROLES.TRAINEE)),
    };
  });
}

/**
 * Fetch a specific attempt by ID with timer countdown and answer key isolation.
 */
export async function getAttemptById(attemptId, actor) {
  const attemptSql = `
    SELECT
      att.*,
      a.course_id,
      a.title AS assessment_title,
      a.duration_minutes,
      a.deadline_at,
      a.status AS assessment_status,
      c.trainer_id AS course_trainer_id,
      c.title AS course_title
    FROM assessment_attempts att
    JOIN assessments a ON a.id = att.assessment_id
    JOIN courses c ON c.id = a.course_id
    WHERE att.id = $1
  `;

  const attemptRes = await runSql(attemptSql, [String(attemptId)]);
  if (!attemptRes.rows.length) {
    throw new AppError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
  }

  const att = attemptRes.rows[0];

  if (actor.role === ROLES.TRAINEE) {
    if (String(att.trainee_id) !== String(actor.id)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to this attempt');
    }
  } else if (actor.role === ROLES.TRAINER) {
    if (actor.role !== ROLES.ADMIN && String(att.course_trainer_id) !== String(actor.id)) {
      throw new AppError(403, 'FORBIDDEN', 'You can only view attempts for your own courses');
    }
  } else if (actor.role !== ROLES.ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied');
  }

  if (att.status === ATTEMPT_STATUSES.IN_PROGRESS) {
    const expiresAt = calculateAttemptExpiry(
      att.started_at,
      att.duration_minutes,
      att.deadline_at,
    );
    const now = new Date();
    if (expiresAt && now > expiresAt) {
      await runSql(
        `UPDATE assessment_attempts
         SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [String(att.id)],
      );
      att.status = ATTEMPT_STATUSES.EXPIRED;
      return {
        attempt: mapAttemptRow(att),
        remainingSeconds: 0,
      };
    }

    return {
      attempt: mapAttemptRow(att),
      remainingSeconds: calculateRemainingSeconds(expiresAt, now),
    };
  }

  if (att.status === ATTEMPT_STATUSES.GRADED || att.status === ATTEMPT_STATUSES.SUBMITTED) {
    const answersSql = `
      SELECT
        ans.id,
        ans.attempt_id,
        ans.question_id,
        ans.selected_option,
        ans.is_correct,
        ans.points_awarded,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_option,
        q.explanation,
        q.points
      FROM attempt_answers ans
      JOIN questions q ON q.id = ans.question_id
      WHERE ans.attempt_id = $1
      ORDER BY q.question_order ASC
    `;

    const answersRes = await runSql(answersSql, [String(attemptId)]);

    return {
      attempt: mapAttemptRow(att),
      answers: answersRes.rows.map((row) => ({
        id: String(row.id),
        attemptId: String(row.attempt_id),
        questionId: String(row.question_id),
        selectedOption: row.selected_option ?? null,
        isCorrect: row.is_correct ?? null,
        pointsAwarded: Number(row.points_awarded ?? 0),
        questionText: row.question_text,
        optionA: row.option_a,
        optionB: row.option_b,
        optionC: row.option_c,
        optionD: row.option_d,
        correctOption: row.correct_option,
        explanation: row.explanation ?? null,
        points: Number(row.points),
      })),
    };
  }

  // For EXPIRED attempts
  return {
    attempt: mapAttemptRow(att),
    remainingSeconds: 0,
  };
}

/**
 * Evaluates canonical course completion criteria for a trainee inside an active
 * transaction by delegating to `issueCertificateIfEligible`:
 * 1. Enrollment exists with status ACTIVE or COMPLETED (not CANCELLED).
 * 2. Course has at least one lesson (totalLessons > 0) and all lessons are completed.
 * 3. All PUBLISHED assessments with is_required = TRUE have at least one GRADED passing attempt.
 *
 * When eligible, atomically transitions ACTIVE enrollment to COMPLETED and issues
 * one certificate + one CERTIFICATE_ISSUED audit event using the active transaction client.
 */
export async function checkAndTriggerCourseCompletion(courseId, traineeId, client = null) {
  const result = await issueCertificateIfEligible(traineeId, courseId, { client });
  return result.issued || result.reason === 'ALREADY_ISSUED';
}

/**
 * Auto-grades and finalizes an in-progress quiz attempt inside a transaction (TRAINEE only).
 * Performs atomic row locking, time limit checking with 30s grace period,
 * evaluation against question bank, scorecard generation, and course completion checking.
 */
export async function submitAttempt(attemptId, payload, actor, { client = null } = {}) {
  if (actor.role !== ROLES.TRAINEE) {
    throw new AppError(403, 'FORBIDDEN', 'Only enrolled trainees can submit assessment attempts');
  }

  const executeSubmitWork = async (txClient) => {
    // 1. Lock the attempt row
    const attemptSql = `
      SELECT
        att.*,
        a.course_id,
        a.title AS assessment_title,
        a.duration_minutes,
        a.deadline_at,
        a.pass_percentage,
        a.status AS assessment_status,
        a.is_required,
        c.title AS course_title
      FROM assessment_attempts att
      JOIN assessments a ON a.id = att.assessment_id
      JOIN courses c ON c.id = a.course_id
      WHERE att.id = $1
      FOR UPDATE OF att
    `;

    const attemptRes = await runSql(attemptSql, [String(attemptId)], txClient);
    if (!attemptRes.rows.length) {
      throw new AppError(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
    }

    const att = attemptRes.rows[0];

    // Ownership check
    if (String(att.trainee_id) !== String(actor.id)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to this attempt');
    }

    // Status checks
    if (att.status === ATTEMPT_STATUSES.GRADED || att.status === ATTEMPT_STATUSES.SUBMITTED) {
      throw new AppError(
        409,
        'ATTEMPT_ALREADY_SUBMITTED',
        'This attempt has already been submitted and graded',
      );
    }
    if (att.status === ATTEMPT_STATUSES.EXPIRED) {
      throw new AppError(
        409,
        'ATTEMPT_EXPIRED',
        'Assessment attempt time limit has expired',
      );
    }
    if (att.status !== ATTEMPT_STATUSES.IN_PROGRESS) {
      throw new AppError(
        409,
        'ATTEMPT_NOT_IN_PROGRESS',
        'Only in-progress attempts can be submitted',
      );
    }

    // Expiry check with 30-second network latency grace buffer
    const expiresAt = calculateAttemptExpiry(
      att.started_at,
      att.duration_minutes,
      att.deadline_at,
    );
    const now = new Date();
    const GRACE_PERIOD_MS = 30 * 1000;

    if (expiresAt && now.getTime() > expiresAt.getTime() + GRACE_PERIOD_MS) {
      await runSql(
        `UPDATE assessment_attempts
         SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [String(att.id)],
        txClient,
      );
      throw new AppError(
        409,
        'ATTEMPT_EXPIRED',
        'Assessment attempt time limit has expired',
      );
    }

    // 2. Fetch all questions for this assessment
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
        points
      FROM questions
      WHERE assessment_id = $1
      ORDER BY question_order ASC
    `;
    const questionsRes = await runSql(questionsSql, [String(att.assessment_id)], txClient);
    const questions = questionsRes.rows;

    if (!questions.length) {
      throw new AppError(409, 'ASSESSMENT_EMPTY', 'Assessment has no questions to grade');
    }

    const questionsMap = new Map(questions.map((q) => [String(q.id), q]));

    // Validate that submitted answers reference valid questions for this assessment
    const submittedAnswers = payload.answers || [];
    for (const ans of submittedAnswers) {
      if (!questionsMap.has(String(ans.questionId))) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Question ${ans.questionId} does not belong to this assessment`,
        );
      }
    }

    const submittedMap = new Map(
      submittedAnswers.map((ans) => [String(ans.questionId), ans.selectedOption ?? null]),
    );

    // 3. Auto-grade each question
    let earnedPoints = 0;
    let totalPoints = 0;
    const gradedAnswers = [];

    for (const q of questions) {
      const qPoints = Number(q.points);
      totalPoints += qPoints;

      const selectedOption = submittedMap.get(String(q.id)) ?? null;
      const isCorrect = selectedOption !== null && selectedOption === q.correct_option;
      const pointsAwarded = isCorrect ? qPoints : 0;
      earnedPoints += pointsAwarded;

      // Insert record into attempt_answers
      const insertAnsSql = `
        INSERT INTO attempt_answers (
          attempt_id,
          assessment_id,
          question_id,
          selected_option,
          is_correct,
          points_awarded,
          answered_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const ansRes = await runSql(
        insertAnsSql,
        [
          String(att.id),
          String(att.assessment_id),
          String(q.id),
          selectedOption,
          isCorrect,
          pointsAwarded,
        ],
        txClient,
      );

      const ansRow = ansRes.rows[0];
      gradedAnswers.push({
        id: String(ansRow.id),
        attemptId: String(ansRow.attempt_id),
        questionId: String(ansRow.question_id),
        selectedOption: ansRow.selected_option ?? null,
        isCorrect: ansRow.is_correct,
        pointsAwarded: Number(ansRow.points_awarded),
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        correctOption: q.correct_option,
        explanation: q.explanation ?? null,
        points: qPoints,
      });
    }

    const scorePercentage =
      totalPoints > 0 ? Number(((earnedPoints / totalPoints) * 100).toFixed(2)) : 0;
    const isPassed = scorePercentage >= Number(att.pass_percentage);

    // 4. Update attempt row to GRADED
    const updateAttemptSql = `
      UPDATE assessment_attempts
      SET
        status = 'GRADED',
        submitted_at = CURRENT_TIMESTAMP,
        graded_at = CURRENT_TIMESTAMP,
        earned_points = $1,
        total_points = $2,
        score_percentage = $3,
        is_passed = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;

    const updatedRes = await runSql(
      updateAttemptSql,
      [earnedPoints, totalPoints, scorePercentage, isPassed, String(att.id)],
      txClient,
    );

    // 5. Check and trigger course completion + certificate issuance if passed
    if (isPassed) {
      await checkAndTriggerCourseCompletion(att.course_id, att.trainee_id, txClient);
    }

    return {
      attempt: mapAttemptRow(updatedRes.rows[0], att),
      answers: gradedAnswers,
    };
  };

  if (client) {
    return await executeSubmitWork(client);
  }
  return await withTransaction(executeSubmitWork);
}

/**
 * List paginated attempt history for the authenticated trainee.
 */
export async function listMyAttempts(query, actor) {
  if (actor.role !== ROLES.TRAINEE) {
    throw new AppError(403, 'FORBIDDEN', 'Only trainees can view their attempt history');
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const conditions = ['att.trainee_id = $1'];
  const params = [String(actor.id)];

  if (query.courseId) {
    params.push(String(query.courseId));
    conditions.push(`a.course_id = $${params.length}`);
  }

  if (query.assessmentId) {
    params.push(String(query.assessmentId));
    conditions.push(`att.assessment_id = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM assessment_attempts att
    JOIN assessments a ON a.id = att.assessment_id
    WHERE ${whereClause}
  `;
  const countRes = await runSql(countSql, params);
  const totalItems = Number(countRes.rows[0]?.total || 0);

  const queryParams = [...params, pageSize, offset];
  const listSql = `
    SELECT
      att.id,
      att.assessment_id,
      a.title AS assessment_title,
      a.course_id,
      c.title AS course_title,
      att.attempt_number,
      att.status,
      att.earned_points,
      att.total_points,
      att.score_percentage,
      att.is_passed,
      att.started_at,
      att.submitted_at,
      att.graded_at,
      att.created_at,
      att.updated_at
    FROM assessment_attempts att
    JOIN assessments a ON a.id = att.assessment_id
    JOIN courses c ON c.id = a.course_id
    WHERE ${whereClause}
    ORDER BY att.started_at DESC, att.id DESC
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
  `;

  const listRes = await runSql(listSql, queryParams);

  const items = listRes.rows.map((row) => ({
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    assessmentTitle: row.assessment_title,
    courseId: String(row.course_id),
    courseTitle: row.course_title,
    attemptNumber: Number(row.attempt_number),
    status: row.status,
    earnedPoints: row.earned_points !== null ? Number(row.earned_points) : null,
    totalPoints: row.total_points !== null ? Number(row.total_points) : null,
    scorePercentage: row.score_percentage !== null ? Number(row.score_percentage) : null,
    isPassed: row.is_passed !== null ? Boolean(row.is_passed) : null,
    startedAt: toIsoString(row.started_at),
    submittedAt: toIsoString(row.submitted_at),
    gradedAt: toIsoString(row.graded_at),
  }));

  return {
    items,
    page,
    pageSize,
    totalItems,
  };
}

/**
 * Get aggregate assessment metrics and paginated student results for a course.
 * Accessible only by course owner TRAINER or ADMIN.
 */
export async function getCourseResults(courseId, query, actor) {
  // 1. Authorize course owner or admin
  const courseRes = await runSql(
    'SELECT id, trainer_id, title FROM courses WHERE id = $1',
    [String(courseId)],
  );
  if (!courseRes.rows.length) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }
  const course = courseRes.rows[0];

  if (actor.role !== ROLES.ADMIN && String(course.trainer_id) !== String(actor.id)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only view results for your own courses');
  }

  // If assessmentId is specified, verify it exists and belongs to this course
  if (query.assessmentId) {
    const aCheck = await runSql(
      'SELECT id FROM assessments WHERE id = $1 AND course_id = $2',
      [String(query.assessmentId), String(courseId)],
    );
    if (!aCheck.rows.length) {
      throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found in this course');
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const baseConditions = ['a.course_id = $1'];
  const baseParams = [String(courseId)];

  if (query.assessmentId) {
    baseParams.push(String(query.assessmentId));
    baseConditions.push(`a.id = $${baseParams.length}`);
  }

  const whereClause = baseConditions.join(' AND ');

  // 2. Compute summary metrics
  const totalAssessmentsRes = await runSql(
    query.assessmentId
      ? `SELECT 1::int AS count`
      : `SELECT COUNT(*)::int AS count FROM assessments WHERE course_id = $1`,
    [String(courseId)],
  );
  const totalAssessments = Number(totalAssessmentsRes.rows[0]?.count || 0);

  const statsSql = `
    SELECT
      COUNT(att.id)::int AS total_attempts,
      COUNT(att.id) FILTER (WHERE att.status = 'GRADED')::int AS graded_attempts,
      COUNT(att.id) FILTER (WHERE att.status = 'GRADED' AND att.is_passed = TRUE)::int AS passed_attempts,
      COALESCE(AVG(att.score_percentage) FILTER (WHERE att.status = 'GRADED'), 0)::numeric(5,2) AS average_score
    FROM assessment_attempts att
    JOIN assessments a ON a.id = att.assessment_id
    WHERE ${whereClause}
  `;
  const statsRes = await runSql(statsSql, baseParams);
  const stats = statsRes.rows[0] || {};

  const totalAttempts = Number(stats.total_attempts || 0);
  const gradedAttempts = Number(stats.graded_attempts || 0);
  const passedAttempts = Number(stats.passed_attempts || 0);
  const passRate =
    gradedAttempts > 0 ? Number(((passedAttempts / gradedAttempts) * 100).toFixed(2)) : 0;
  const averageScorePercentage = Number(Number(stats.average_score || 0).toFixed(2));

  // 3. Paginated items
  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM assessment_attempts att
    JOIN assessments a ON a.id = att.assessment_id
    WHERE ${whereClause}
  `;
  const countRes = await runSql(countSql, baseParams);
  const totalItems = Number(countRes.rows[0]?.total || 0);

  const queryParams = [...baseParams, pageSize, offset];
  const itemsSql = `
    SELECT
      att.id,
      att.assessment_id,
      a.title AS assessment_title,
      a.course_id,
      att.trainee_id,
      u.full_name AS trainee_name,
      att.attempt_number,
      att.status,
      att.earned_points,
      att.total_points,
      att.score_percentage,
      att.is_passed,
      att.started_at,
      att.submitted_at,
      att.graded_at
    FROM assessment_attempts att
    JOIN assessments a ON a.id = att.assessment_id
    JOIN users u ON u.id = att.trainee_id
    WHERE ${whereClause}
    ORDER BY att.started_at DESC, att.id DESC
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
  `;
  const itemsRes = await runSql(itemsSql, queryParams);

  const items = itemsRes.rows.map((row) => ({
    id: String(row.id),
    assessmentId: String(row.assessment_id),
    assessmentTitle: row.assessment_title,
    courseId: String(row.course_id),
    traineeId: String(row.trainee_id),
    traineeName: row.trainee_name,
    attemptNumber: Number(row.attempt_number),
    status: row.status,
    earnedPoints: row.earned_points !== null ? Number(row.earned_points) : null,
    totalPoints: row.total_points !== null ? Number(row.total_points) : null,
    scorePercentage: row.score_percentage !== null ? Number(row.score_percentage) : null,
    isPassed: row.is_passed !== null ? Boolean(row.is_passed) : null,
    startedAt: toIsoString(row.started_at),
    submittedAt: toIsoString(row.submitted_at),
    gradedAt: toIsoString(row.graded_at),
  }));

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

  return {
    summary: {
      courseId: String(courseId),
      totalAssessments,
      totalAttempts,
      gradedAttempts,
      passedAttempts,
      passRate,
      averageScorePercentage,
    },
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}

/**
 * Format a feedback database row into a canonical camelCase DTO.
 */
export function mapFeedbackRow(row) {
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    rating: Number(row.rating),
    comment: row.comment ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

/**
 * Upsert a trainee review/feedback for an enrolled course.
 * Uses PostgreSQL INSERT ... ON CONFLICT (trainee_id, course_id) DO UPDATE.
 */
export async function upsertCourseFeedback(courseId, payload, actor) {
  if (actor.role !== ROLES.TRAINEE) {
    throw new AppError(403, 'FORBIDDEN', 'Only trainees can submit course feedback');
  }

  await verifyCourseEnrollment(courseId, actor.id, {
    requirePublishedCourse: true,
    allowedStatuses: [ENROLLMENT_STATUSES.ACTIVE, ENROLLMENT_STATUSES.COMPLETED],
  });

  const upsertSql = `
    INSERT INTO feedback (
      trainee_id,
      course_id,
      rating,
      comment,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (trainee_id, course_id) DO UPDATE
    SET
      rating = EXCLUDED.rating,
      comment = EXCLUDED.comment,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;

  const result = await runSql(upsertSql, [
    String(actor.id),
    String(courseId),
    payload.rating,
    payload.comment ?? null,
  ]);

  return {
    feedback: mapFeedbackRow(result.rows[0]),
  };
}

/**
 * Get aggregate rating statistics and paginated public reviews for a course.
 * Preserves student privacy: never returns emails, IDs, or sensitive account fields.
 */
export async function getCourseFeedback(courseId, query, actor) {
  const courseRes = await runSql(
    'SELECT id, trainer_id, status FROM courses WHERE id = $1',
    [String(courseId)],
  );
  if (!courseRes.rows.length) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }
  const course = courseRes.rows[0];

  if (course.status !== COURSE_STATUSES.PUBLISHED) {
    if (actor.role !== ROLES.ADMIN && String(course.trainer_id) !== String(actor.id)) {
      throw new AppError(403, 'FORBIDDEN', 'Cannot view feedback for an unpublished course');
    }
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  // 1. Aggregate statistics
  const summaryRes = await runSql(
    `SELECT
       COUNT(*)::int AS total_ratings,
       COALESCE(AVG(rating), 0)::numeric(3,2) AS average_rating
     FROM feedback
     WHERE course_id = $1`,
    [String(courseId)],
  );

  const totalRatings = Number(summaryRes.rows[0]?.total_ratings || 0);
  const averageRating = Number(Number(summaryRes.rows[0]?.average_rating || 0).toFixed(2));

  // 2. Paginated review items (privacy safe: only reviewer_name)
  const listSql = `
    SELECT
      f.id,
      f.course_id,
      f.rating,
      f.comment,
      f.created_at,
      f.updated_at,
      u.full_name AS reviewer_name
    FROM feedback f
    JOIN users u ON u.id = f.trainee_id
    WHERE f.course_id = $1
    ORDER BY f.created_at DESC, f.id DESC
    LIMIT $2 OFFSET $3
  `;

  const listRes = await runSql(listSql, [String(courseId), pageSize, offset]);

  const items = listRes.rows.map((row) => ({
    id: String(row.id),
    courseId: String(row.course_id),
    rating: Number(row.rating),
    comment: row.comment ?? null,
    reviewerName: row.reviewer_name,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }));

  const totalPages = totalRatings === 0 ? 0 : Math.ceil(totalRatings / pageSize);

  return {
    summary: {
      courseId: String(courseId),
      averageRating,
      totalRatings,
    },
    items,
    pagination: {
      page,
      pageSize,
      totalItems: totalRatings,
      totalPages,
    },
  };
}
