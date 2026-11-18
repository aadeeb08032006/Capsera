/**
 * Pure state and resolution helpers for QuizPlayer, TrainerAssessmentBuilder,
 * and TrainerCourseResultsView.
 */

/**
 * Resolves the initial countdown remaining seconds for a quiz attempt.
 * Returns `null` when an assessment is untimed so callers never coerce a
 * missing duration into `0` and accidentally trigger timer auto-submission.
 *
 * @param {object} params
 * @param {number | null | undefined} [params.serverRemainingSeconds]
 * @param {number | string | null | undefined} [params.durationMinutes]
 * @returns {number | null}
 */
export function resolveInitialRemainingSeconds({
  serverRemainingSeconds,
  durationMinutes,
} = {}) {
  if (serverRemainingSeconds !== null && serverRemainingSeconds !== undefined) {
    const parsedServer = Number(serverRemainingSeconds);
    if (Number.isFinite(parsedServer)) {
      return Math.max(0, Math.floor(parsedServer));
    }
  }

  if (durationMinutes !== null && durationMinutes !== undefined && durationMinutes !== '') {
    const parsedMinutes = Number(durationMinutes);
    if (Number.isFinite(parsedMinutes) && parsedMinutes > 0) {
      return Math.round(parsedMinutes * 60);
    }
  }

  return null;
}

/**
 * Returns true only when a valid finite timer countdown should be displayed.
 *
 * @param {number | null | undefined} remainingSeconds
 * @returns {boolean}
 */
export function shouldRenderCountdown(remainingSeconds) {
  return (
    remainingSeconds !== null &&
    remainingSeconds !== undefined &&
    typeof remainingSeconds === 'number' &&
    Number.isFinite(remainingSeconds)
  );
}

/**
 * Resolves questions when resuming an in-progress attempt, falling back to the
 * assessment detail questions list when the attempt endpoint omits them.
 *
 * @param {object} params
 * @param {Array | null | undefined} [params.resumeQuestions]
 * @param {Array | null | undefined} [params.assessmentQuestions]
 * @returns {Array}
 */
export function resolveResumedQuestions({
  resumeQuestions,
  assessmentQuestions,
} = {}) {
  if (Array.isArray(resumeQuestions) && resumeQuestions.length > 0) {
    return resumeQuestions;
  }
  if (Array.isArray(assessmentQuestions) && assessmentQuestions.length > 0) {
    return assessmentQuestions;
  }
  return [];
}

/**
 * Formats the overview Time Allowed label cleanly for both timed and untimed quizzes.
 *
 * @param {number | string | null | undefined} durationMinutes
 * @returns {string}
 */
export function formatTimeAllowedLabel(durationMinutes) {
  if (durationMinutes !== null && durationMinutes !== undefined && durationMinutes !== '') {
    const parsed = Number(durationMinutes);
    if (Number.isFinite(parsed) && parsed > 0) {
      return `${parsed} Min`;
    }
  }
  return 'Untimed';
}

/**
 * Resolves the active course ID from route parameters or explicit user selection.
 * Never silently falls back to a hard-coded course ID such as `'1'`.
 *
 * @param {object} params
 * @param {string | number | null | undefined} [params.routeCourseId]
 * @param {string | number | null | undefined} [params.selectedCourseId]
 * @returns {string}
 */
export function resolveCourseSelection({
  routeCourseId,
  selectedCourseId,
} = {}) {
  if (routeCourseId !== null && routeCourseId !== undefined) {
    const trimmedRoute = String(routeCourseId).trim();
    if (trimmedRoute) return trimmedRoute;
  }

  if (selectedCourseId !== null && selectedCourseId !== undefined) {
    const trimmedSelected = String(selectedCourseId).trim();
    if (trimmedSelected) return trimmedSelected;
  }

  return '';
}

/**
 * Builds the course-listing query parameters so TRAINER users only retrieve
 * courses they own (`mine=true`), while ADMIN users can browse platform courses.
 *
 * @param {string | null | undefined} role
 * @returns {{ page: number, pageSize: number, mine?: string }}
 */
export function buildCourseListQueryForRole(role) {
  if (role === 'TRAINER') {
    return { mine: 'true', page: 1, pageSize: 100 };
  }
  return { page: 1, pageSize: 100 };
}
