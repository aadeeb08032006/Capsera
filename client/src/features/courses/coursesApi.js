import { apiRequest, API_BASE_URL, TOKEN_STORAGE_KEY } from '../../services/apiClient.js';
import { executeResourceDownload } from './resourceDownloadHelpers.js';

/**
 * Courses API Service
 * Interacts with the real CAPSERA backend (/api/v1/courses, /api/v1/lessons, /api/v1/enrollments).
 * No mock data.
 */

// ============================================================================
// Courses Endpoints
// ============================================================================

export async function listCourses(params = {}, options = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params.subject) searchParams.set('subject', params.subject);
  if (params.level) searchParams.set('level', params.level);
  if (params.search) searchParams.set('search', params.search);
  if (params.mine) searchParams.set('mine', String(params.mine));
  if (params.status) searchParams.set('status', params.status);

  const query = searchParams.toString();
  const endpoint = query ? `/courses?${query}` : '/courses';
  const payload = await apiRequest(endpoint, { ...options, method: 'GET' });
  return payload.data;
}

export async function getCourseById(courseId, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}`, {
    ...options,
    method: 'GET',
  });
  return payload.data?.course;
}

export async function createCourse(courseData, options = {}) {
  const payload = await apiRequest('/courses', {
    ...options,
    method: 'POST',
    body: JSON.stringify(courseData),
  });
  return payload.data?.course;
}

export async function updateCourse(courseId, updates, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}`, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return payload.data?.course;
}

export async function publishCourse(courseId, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}/publish`, {
    ...options,
    method: 'POST',
  });
  return payload.data?.course;
}

export async function archiveCourse(courseId, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}/archive`, {
    ...options,
    method: 'POST',
  });
  return payload.data?.course;
}

export async function deleteCourse(courseId, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}`, {
    ...options,
    method: 'DELETE',
  });
  return payload.data;
}

// ============================================================================
// Lessons Endpoints
// ============================================================================

export async function listLessons(courseId, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}/lessons`, {
    ...options,
    method: 'GET',
  });
  return payload.data?.lessons || [];
}

export async function getLessonById(lessonId, options = {}) {
  const payload = await apiRequest(`/lessons/${lessonId}`, {
    ...options,
    method: 'GET',
  });
  return payload.data?.lesson;
}

export async function createLesson(courseId, lessonData, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}/lessons`, {
    ...options,
    method: 'POST',
    body: JSON.stringify(lessonData),
  });
  return payload.data?.lesson;
}

export async function updateLesson(lessonId, updates, options = {}) {
  const payload = await apiRequest(`/lessons/${lessonId}`, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return payload.data?.lesson;
}

export async function reorderLessons(courseId, lessonIds, options = {}) {
  const ids = Array.isArray(lessonIds) ? lessonIds : (lessonIds?.orderedLessonIds || []);
  const payload = await apiRequest(`/courses/${courseId}/lessons/reorder`, {
    ...options,
    method: 'PUT',
    body: JSON.stringify({ lessonIds: ids }),
  });
  return payload.data?.lessons || [];
}

export async function deleteLesson(lessonId, options = {}) {
  const payload = await apiRequest(`/lessons/${lessonId}`, {
    ...options,
    method: 'DELETE',
  });
  return payload.data;
}

// ============================================================================
// Learning Resources Endpoints
// ============================================================================

export async function listResources(courseId, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}/resources`, {
    ...options,
    method: 'GET',
  });
  return payload.data?.resources || [];
}

export async function uploadResource(courseId, formData, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}/resources`, {
    ...options,
    method: 'POST',
    body: formData,
  });
  return payload.data?.resource;
}

export async function deleteResource(courseId, resourceId, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}/resources/${resourceId}`, {
    ...options,
    method: 'DELETE',
  });
  return payload.data;
}

export async function downloadResourceFile(courseId, resourceId, fallbackFilename = 'resource-file') {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;

  return executeResourceDownload({
    courseId,
    resourceId,
    fallbackFilename,
    token,
    apiBaseUrl: API_BASE_URL,
    onUnauthorized: () => {
      if (typeof window !== 'undefined' && token) {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('capsera:unauthorized'));
      }
    },
  });
}

// ============================================================================
// Enrollments & Progress Endpoints
// ============================================================================

export async function enrollInCourse(courseId, options = {}) {
  const payload = await apiRequest(`/courses/${courseId}/enrollments`, {
    ...options,
    method: 'POST',
  });
  return payload.data?.enrollment;
}

export async function getMyEnrollments(options = {}) {
  const payload = await apiRequest('/enrollments/me', {
    ...options,
    method: 'GET',
  });
  return payload.data?.enrollments || payload.data?.items || [];
}

export async function markLessonProgress(enrollmentId, lessonId, options = {}) {
  const payload = await apiRequest(`/enrollments/${enrollmentId}/progress`, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify({ lessonId }),
  });
  return payload.data;
}
