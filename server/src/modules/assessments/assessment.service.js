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
      FROM assessment_attempt_answers ans
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
