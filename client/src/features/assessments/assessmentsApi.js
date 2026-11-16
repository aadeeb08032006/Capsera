import { apiRequest } from '../../services/apiClient.js';

/**
 * Assessment and Feedback API client for CAPSERA (Member 3).
 * Wraps canonical /api/v1 endpoints for assessments, questions, attempts, and feedback.
 */

// ─── Assessments CRUD & Publishing ───

export async function listAssessmentsByCourse(courseId, { page, pageSize, status } = {}, options = {}) {
  const searchParams = new URLSearchParams();
  if (page) searchParams.set('page', String(page));
  if (pageSize) searchParams.set('pageSize', String(pageSize));
  if (status) searchParams.set('status', status);

  const query = searchParams.toString();
  const endpoint = `/courses/${courseId}/assessments${query ? `?${query}` : ''}`;
  const payload = await apiRequest(endpoint, { ...options, method: 'GET' });
  return payload.data;
}

export async function getAssessmentById(assessmentId, options = {}) {
  const payload = await apiRequest(`/assessments/${assessmentId}`, { ...options, method: 'GET' });
  return payload.data;
}

export async function createAssessment(courseId, payload, options = {}) {
  const res = await apiRequest(`/courses/${courseId}/assessments`, {
    ...options,
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data?.assessment;
}

export async function updateAssessment(assessmentId, updates, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}`, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return res.data?.assessment;
}

export async function publishAssessment(assessmentId, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}/publish`, {
    ...options,
    method: 'POST',
  });
  return res.data?.assessment;
}

export async function deleteAssessment(assessmentId, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}`, {
    ...options,
    method: 'DELETE',
  });
  return res.data;
}

// ─── Question Bank CRUD ───

export async function listQuestionsByAssessment(assessmentId, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}/questions`, {
    ...options,
    method: 'GET',
  });
  return res.data?.items ?? [];
}

export async function getQuestionById(assessmentId, questionId, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}/questions/${questionId}`, {
    ...options,
    method: 'GET',
  });
  return res.data?.question;
}

export async function createQuestion(assessmentId, payload, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}/questions`, {
    ...options,
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data?.question;
}

export async function updateQuestion(assessmentId, questionId, updates, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}/questions/${questionId}`, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return res.data?.question;
}

export async function deleteQuestion(assessmentId, questionId, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}/questions/${questionId}`, {
    ...options,
    method: 'DELETE',
  });
  return res.data;
}

// ─── Attempts & Countdown Timer ───

export async function startAttempt(assessmentId, options = {}) {
  const res = await apiRequest(`/assessments/${assessmentId}/attempts`, {
    ...options,
    method: 'POST',
  });
  return res.data;
}

export async function getAttemptById(attemptId, options = {}) {
  const res = await apiRequest(`/attempts/${attemptId}`, {
    ...options,
    method: 'GET',
  });
  return res.data;
}

export async function submitAttempt(attemptId, { answers }, options = {}) {
  const res = await apiRequest(`/attempts/${attemptId}/submit`, {
    ...options,
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
  return res.data;
}

export async function listMyAttempts({ page, pageSize, courseId, assessmentId } = {}, options = {}) {
  const searchParams = new URLSearchParams();
  if (page) searchParams.set('page', String(page));
  if (pageSize) searchParams.set('pageSize', String(pageSize));
  if (courseId) searchParams.set('courseId', String(courseId));
  if (assessmentId) searchParams.set('assessmentId', String(assessmentId));

  const query = searchParams.toString();
  const endpoint = `/attempts/me${query ? `?${query}` : ''}`;
  const res = await apiRequest(endpoint, { ...options, method: 'GET' });
  return res.data;
}

// ─── Course Analytics & Student Results ───

export async function getCourseResults(courseId, { page, pageSize, assessmentId } = {}, options = {}) {
  const searchParams = new URLSearchParams();
  if (page) searchParams.set('page', String(page));
  if (pageSize) searchParams.set('pageSize', String(pageSize));
  if (assessmentId) searchParams.set('assessmentId', String(assessmentId));

  const query = searchParams.toString();
  const endpoint = `/courses/${courseId}/results${query ? `?${query}` : ''}`;
  const res = await apiRequest(endpoint, { ...options, method: 'GET' });
  return res.data;
}

// ─── Course Feedback & Reviews ───

export async function getCourseFeedback(courseId, { page, pageSize } = {}, options = {}) {
  const searchParams = new URLSearchParams();
  if (page) searchParams.set('page', String(page));
  if (pageSize) searchParams.set('pageSize', String(pageSize));

  const query = searchParams.toString();
  const endpoint = `/courses/${courseId}/feedback${query ? `?${query}` : ''}`;
  const res = await apiRequest(endpoint, { ...options, method: 'GET' });
  return res.data;
}

export async function upsertCourseFeedback(courseId, payload, options = {}) {
  const res = await apiRequest(`/courses/${courseId}/feedback`, {
    ...options,
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data?.feedback;
}
