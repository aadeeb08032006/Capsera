import {
  evaluateCourseCompletionEligibility,
  issueCertificateIfEligible,
} from '../certificates/certificates.service.js';

/**
 * Evaluate whether all course completion requirements are satisfied for a trainee
 * by delegating to the canonical certificate eligibility service (PRD Sections 6.6 & 6.7):
 * 1. Enrollment exists with status ACTIVE or COMPLETED (not CANCELLED).
 * 2. Course has at least one lesson (totalLessons > 0) and all lessons are completed.
 * 3. Every required, published assessment has at least one GRADED passing attempt.
 *
 * @param {string|number} courseId
 * @param {string|number} enrollmentId
 * @param {string|number} traineeId
 * @param {object|null} client - Optional transaction client
 * @returns {Promise<{ isComplete: boolean, reason: string, progress: object, eligibility: object }>}
 */
export async function evaluateCourseCompletion(courseId, enrollmentId, traineeId, client = null) {
  const eligibility = await evaluateCourseCompletionEligibility(traineeId, courseId, { client });
  const totalLessons = eligibility.totalLessons;
  const completedLessons = eligibility.completedLessons;
  const progressPercentage =
    totalLessons > 0
      ? Math.min(100, Math.max(0, Math.round((completedLessons / totalLessons) * 100)))
      : 0;

  return {
    isComplete: eligibility.eligible,
    reason: eligibility.reason,
    progress: {
      completedLessons,
      totalLessons,
      progressPercentage,
    },
    eligibility,
  };
}

/**
 * Evaluate canonical completion rules and, when eligible, atomically transition
 * the enrollment to COMPLETED and issue a certificate + CERTIFICATE_ISSUED audit
 * event inside the active transaction.
 *
 * @param {string|number} courseId
 * @param {string|number} enrollmentId
 * @param {string|number} traineeId
 * @param {object|null} client - Optional transaction client
 */
export async function checkAndApplyCourseCompletion(
  courseId,
  enrollmentId,
  traineeId,
  client = null,
) {
  const issuance = await issueCertificateIfEligible(traineeId, courseId, { client });
  const isComplete = issuance.issued || issuance.reason === 'ALREADY_ISSUED';

  return {
    isComplete,
    issued: issuance.issued,
    reason: issuance.reason,
    certificate: issuance.certificate,
  };
}
