import {
  ASSESSMENT_STATUSES,
  ATTEMPT_STATUSES,
  COURSE_STATUSES,
  ENROLLMENT_STATUSES,
  ROLES,
  USER_STATUSES,
} from '../../shared/constants.js';
import {
  fetchDashboardSummaryCounts,
  fetchOverallAssessmentPerformance,
  fetchSubjectAssessmentPerformance,
} from './dashboard.repository.js';

function toInt(value) {
  const parsed = Number.parseInt(value ?? 0, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function roundTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

function calculateRate(numerator, denominator) {
  if (denominator <= 0) {
    return 0;
  }
  return roundTwoDecimals((numerator / denominator) * 100);
}

function formatAverageScore(gradedAttempts, rawAverage) {
  if (gradedAttempts <= 0 || rawAverage === null || rawAverage === undefined) {
    return null;
  }
  const numericAverage = Number(rawAverage);
  return Number.isFinite(numericAverage) ? roundTwoDecimals(numericAverage) : null;
}

/**
 * Return platform-wide aggregate counts and rates for the Admin Dashboard.
 *
 * Completion rate convention (PROPOSED):
 * `completed / (active + completed) * 100`, returning `0` when the denominator is `0`.
 */
export async function getDashboardSummary() {
  const row = await fetchDashboardSummaryCounts();

  const activeEnrollments = toInt(row.activeEnrollments);
  const completedEnrollments = toInt(row.completedEnrollments);
  const cancelledEnrollments = toInt(row.cancelledEnrollments);
  const completionRate = calculateRate(completedEnrollments, activeEnrollments + completedEnrollments);

  return {
    users: {
      total: toInt(row.totalUsers),
      byRole: {
        [ROLES.TRAINEE]: toInt(row.traineeUsers),
        [ROLES.TRAINER]: toInt(row.trainerUsers),
        [ROLES.ADMIN]: toInt(row.adminUsers),
      },
      byStatus: {
        [USER_STATUSES.PENDING]: toInt(row.pendingUsers),
        [USER_STATUSES.ACTIVE]: toInt(row.activeUsers),
        [USER_STATUSES.REJECTED]: toInt(row.rejectedUsers),
        [USER_STATUSES.SUSPENDED]: toInt(row.suspendedUsers),
      },
    },
    courses: {
      total: toInt(row.totalCourses),
      byStatus: {
        [COURSE_STATUSES.DRAFT]: toInt(row.draftCourses),
        [COURSE_STATUSES.PUBLISHED]: toInt(row.publishedCourses),
        [COURSE_STATUSES.ARCHIVED]: toInt(row.archivedCourses),
      },
    },
    enrollments: {
      total: toInt(row.totalEnrollments),
      byStatus: {
        [ENROLLMENT_STATUSES.ACTIVE]: activeEnrollments,
        [ENROLLMENT_STATUSES.COMPLETED]: completedEnrollments,
        [ENROLLMENT_STATUSES.CANCELLED]: cancelledEnrollments,
      },
      completionRate,
    },
    assessments: {
      total: toInt(row.totalAssessments),
      byStatus: {
        [ASSESSMENT_STATUSES.DRAFT]: toInt(row.draftAssessments),
        [ASSESSMENT_STATUSES.PUBLISHED]: toInt(row.publishedAssessments),
        [ASSESSMENT_STATUSES.CLOSED]: toInt(row.closedAssessments),
      },
    },
    attempts: {
      total: toInt(row.totalAttempts),
      byStatus: {
        [ATTEMPT_STATUSES.IN_PROGRESS]: toInt(row.inProgressAttempts),
        [ATTEMPT_STATUSES.SUBMITTED]: toInt(row.submittedAttempts),
        [ATTEMPT_STATUSES.GRADED]: toInt(row.gradedAttempts),
        [ATTEMPT_STATUSES.EXPIRED]: toInt(row.expiredAttempts),
      },
      passedCount: toInt(row.passedAttempts),
    },
    certificates: {
      totalIssued: toInt(row.totalCertificates),
      validCount: toInt(row.validCertificates),
      revokedCount: toInt(row.revokedCertificates),
    },
    participation: {
      enrolledTrainees: toInt(row.enrolledTrainees),
      attemptingTrainees: toInt(row.attemptingTrainees),
    },
  };
}

/**
 * Return platform-wide and subject-level assessment outcome summaries.
 */
export async function getAssessmentPerformance() {
  const [overallRow, subjectRows] = await Promise.all([
    fetchOverallAssessmentPerformance(),
    fetchSubjectAssessmentPerformance(),
  ]);

  const totalAssessments = toInt(overallRow.totalAssessments);
  const totalAttempts = toInt(overallRow.totalAttempts);
  const gradedAttempts = toInt(overallRow.gradedAttempts);
  const passedAttempts = toInt(overallRow.passedAttempts);

  return {
    overall: {
      totalAssessments,
      totalAttempts,
      gradedAttempts,
      passedAttempts,
      passRate: calculateRate(passedAttempts, gradedAttempts),
      averageScorePercentage: formatAverageScore(gradedAttempts, overallRow.averageScorePercentage),
    },
    bySubject: subjectRows.map((row) => {
      const subjectGraded = toInt(row.gradedAttemptCount);
      const subjectPassed = toInt(row.passedAttemptCount);
      return {
        subject: row.subject || 'Unspecified',
        courseCount: toInt(row.courseCount),
        assessmentCount: toInt(row.assessmentCount),
        attemptCount: toInt(row.attemptCount),
        gradedAttemptCount: subjectGraded,
        passedAttemptCount: subjectPassed,
        passRate: calculateRate(subjectPassed, subjectGraded),
        averageScorePercentage: formatAverageScore(subjectGraded, row.averageScorePercentage),
      };
    }),
  };
}

