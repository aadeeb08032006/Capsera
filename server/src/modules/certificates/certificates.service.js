import crypto from 'node:crypto';
import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/AppError.js';
import { ENROLLMENT_STATUSES } from '../../shared/constants.js';
import {
  findCertificateByCode,
  findCertificateByTraineeAndCourse,
  findCertificatesByTraineeId,
  findCourseEligibilitySnapshot,
  insertCertificate,
  markEnrollmentCompleted,
} from './certificates.repository.js';

const MAX_CODE_GENERATION_ATTEMPTS = 5;

function toIsoOrNull(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function formatTraineeCertificate(row) {
  const isValid = row.revokedAt === null || row.revokedAt === undefined;
  return {
    id: String(row.id),
    traineeId: String(row.traineeId),
    courseId: String(row.courseId),
    courseTitle: row.courseTitle,
    courseSubject: row.courseSubject,
    certificateCode: row.certificateCode,
    issuedAt: toIsoOrNull(row.issuedAt),
    revokedAt: toIsoOrNull(row.revokedAt),
    isValid,
    status: isValid ? 'VALID' : 'REVOKED',
  };
}

function formatVerificationCertificate(row) {
  const isValid = row.revokedAt === null || row.revokedAt === undefined;
  return {
    certificateCode: row.certificateCode,
    traineeName: row.traineeName,
    courseTitle: row.courseTitle,
    issuedAt: toIsoOrNull(row.issuedAt),
    revokedAt: toIsoOrNull(row.revokedAt),
    isValid,
    status: isValid ? 'VALID' : 'REVOKED',
  };
}

/**
 * Generate a readable, high-entropy certificate verification code (<= 64 chars)
 * using Node's cryptographically strong CSPRNG (`crypto.randomBytes`).
 */
export function generateCertificateCode() {
  const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `CAP-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/**
 * Evaluate whether `(traineeId, courseId)` satisfies PRD Section 6.6 & 6.7 completion rules:
 * 1. Enrollment exists with status ACTIVE or COMPLETED.
 * 2. At least one lesson exists in the course (`totalLessons > 0`).
 * 3. All course lessons are completed for that enrollment.
 * 4. Every required PUBLISHED assessment has at least one GRADED, passing attempt
 *    (if no required published assessments exist, lesson completion alone is sufficient).
 */
export async function evaluateCourseCompletionEligibility(
  traineeId,
  courseId,
  { client = null } = {},
) {
  const snapshot = await findCourseEligibilitySnapshot(
    client,
    String(traineeId),
    String(courseId),
  );

  if (!snapshot) {
    return {
      eligible: false,
      reason: 'NOT_ENROLLED',
      enrollmentId: null,
      enrollmentStatus: null,
      totalLessons: 0,
      completedLessons: 0,
      requiredAssessmentCount: 0,
      passedRequiredAssessmentCount: 0,
    };
  }

  const totalLessons = Number(snapshot.totalLessons ?? 0);
  const completedLessons = Number(snapshot.completedLessons ?? 0);
  const requiredAssessmentCount = Number(snapshot.requiredAssessmentCount ?? 0);
  const passedRequiredAssessmentCount = Number(snapshot.passedRequiredAssessmentCount ?? 0);

  const isEntitledEnrollment =
    snapshot.enrollmentStatus === ENROLLMENT_STATUSES.ACTIVE ||
    snapshot.enrollmentStatus === ENROLLMENT_STATUSES.COMPLETED;

  let reason = 'ELIGIBLE';
  if (!isEntitledEnrollment) {
    reason = 'ENROLLMENT_INACTIVE';
  } else if (totalLessons <= 0) {
    reason = 'NO_LESSONS';
  } else if (completedLessons < totalLessons) {
    reason = 'LESSONS_INCOMPLETE';
  } else if (passedRequiredAssessmentCount < requiredAssessmentCount) {
    reason = 'REQUIRED_ASSESSMENTS_INCOMPLETE';
  }

  return {
    eligible: reason === 'ELIGIBLE',
    reason,
    enrollmentId: String(snapshot.enrollmentId),
    enrollmentStatus: snapshot.enrollmentStatus,
    totalLessons,
    completedLessons,
    requiredAssessmentCount,
    passedRequiredAssessmentCount,
  };
}

async function issueInsideTransaction(txClient, traineeId, courseId) {
  const normalizedTraineeId = String(traineeId);
  const normalizedCourseId = String(courseId);

  const eligibility = await evaluateCourseCompletionEligibility(
    normalizedTraineeId,
    normalizedCourseId,
    { client: txClient },
  );

  if (!eligibility.eligible) {
    return {
      issued: false,
      reason: eligibility.reason,
      certificate: null,
    };
  }

  if (eligibility.enrollmentStatus === ENROLLMENT_STATUSES.ACTIVE) {
    await markEnrollmentCompleted(txClient, eligibility.enrollmentId);
  }

  const existingBeforeInsert = await findCertificateByTraineeAndCourse(
    txClient,
    normalizedTraineeId,
    normalizedCourseId,
  );
  if (existingBeforeInsert) {
    return {
      issued: false,
      reason: 'ALREADY_ISSUED',
      certificate: formatTraineeCertificate(existingBeforeInsert),
    };
  }

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const certificateCode = generateCertificateCode();
    try {
      const created = await insertCertificate(txClient, {
        traineeId: normalizedTraineeId,
        courseId: normalizedCourseId,
        certificateCode,
      });

      if (created) {
        return {
          issued: true,
          reason: 'ISSUED',
          certificate: formatTraineeCertificate(created),
        };
      }

      // ON CONFLICT DO NOTHING returned no row: check whether (trainee_id, course_id) already won.
      const existingAfterConflict = await findCertificateByTraineeAndCourse(
        txClient,
        normalizedTraineeId,
        normalizedCourseId,
      );
      if (existingAfterConflict) {
        return {
          issued: false,
          reason: 'ALREADY_ISSUED',
          certificate: formatTraineeCertificate(existingAfterConflict),
        };
      }
      // Otherwise the conflict was on certificate_code; retry with a new random code.
    } catch (error) {
      if (error?.code === '23505' && error?.constraint === 'uq_certificates_code') {
        continue;
      }
      if (error?.code === '23505' && error?.constraint === 'uq_certificates_trainee_course') {
        const existing = await findCertificateByTraineeAndCourse(
          txClient,
          normalizedTraineeId,
          normalizedCourseId,
        );
        if (existing) {
          return {
            issued: false,
            reason: 'ALREADY_ISSUED',
            certificate: formatTraineeCertificate(existing),
          };
        }
      }
      throw error;
    }
  }

  throw new AppError(
    500,
    'INTERNAL_SERVER_ERROR',
    'Could not generate a unique certificate code',
  );
}

/**
 * Transactional internal helper designed for Member 2 (lesson completion) and
 * Member 3 (assessment completion) workflows. Reuses a caller-provided transaction
 * client if present, or opens a transaction with `withTransaction`.
 */
export async function issueCertificateIfEligible(
  traineeId,
  courseId,
  { client = null } = {},
) {
  try {
    if (client) {
      return await issueInsideTransaction(client, traineeId, courseId);
    }
    return await withTransaction((txClient) =>
      issueInsideTransaction(txClient, traineeId, courseId),
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

/**
 * List certificates owned by the authenticated trainee (strictly read-only).
 */
export async function listMyCertificates(traineeId, { page, pageSize }) {
  const offset = (page - 1) * pageSize;

  try {
    const result = await findCertificatesByTraineeId({
      traineeId: String(traineeId),
      limit: pageSize,
      offset,
    });

    return {
      items: result.items.map(formatTraineeCertificate),
      page,
      pageSize,
      totalItems: result.totalItems,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

/**
 * Publicly verify a certificate by code without exposing private user data.
 */
export async function verifyCertificateByCode(certificateCode) {
  try {
    const row = await findCertificateByCode(certificateCode);
    if (!row) {
      throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found');
    }
    return formatVerificationCertificate(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Database operation failed');
  }
}

