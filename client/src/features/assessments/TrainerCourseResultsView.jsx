import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { listCourses } from '../courses/coursesApi.js';
import { getCourseResults, listAssessmentsByCourse } from './assessmentsApi.js';
import {
  buildCourseListQueryForRole,
  resolveCourseSelection,
} from './assessmentHelpers.js';
import UiIcon from '../../components/UiIcon.jsx';
import './assessments.css';

export default function TrainerCourseResultsView() {
  const { courseId: routeCourseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState(
    routeCourseId ? String(routeCourseId).trim() : '',
  );
  const courseId = resolveCourseSelection({
    routeCourseId,
    selectedCourseId,
  });

  const [ownedCourses, setOwnedCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState(null);

  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize, totalItems: 0, totalPages: 0 });
  const [loading, setLoading] = useState(Boolean(courseId));
  const [error, setError] = useState(null);

  // Sync courseId state when route parameter changes
  useEffect(() => {
    setSelectedCourseId(routeCourseId ? String(routeCourseId).trim() : '');
    setSelectedAssessmentId('');
    setPage(1);
  }, [routeCourseId]);

  // Load owned courses (TRAINER) or platform courses (ADMIN)
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadingCourses(true);
    setCoursesError(null);

    listCourses(buildCourseListQueryForRole(user?.role), { signal: controller.signal })
      .then((res) => {
        if (!active) return;
        setOwnedCourses(Array.isArray(res?.items) ? res.items : []);
        setLoadingCourses(false);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setCoursesError(err.message || 'Failed to load courses.');
        setLoadingCourses(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user?.role]);

  // Load course assessments for filter dropdown when a course is selected
  useEffect(() => {
    if (!courseId) {
      setAssessments([]);
      return;
    }

    async function loadFilterAssessments() {
      try {
        const res = await listAssessmentsByCourse(courseId);
        setAssessments(res.items || []);
      } catch {
        setAssessments([]);
      }
    }
    loadFilterAssessments();
  }, [courseId]);

  // Load course analytics & student results when a course is selected
  useEffect(() => {
    if (!courseId) {
      setSummary(null);
      setItems([]);
      setPagination({ page: 1, pageSize, totalItems: 0, totalPages: 0 });
      setLoading(false);
      setError(null);
      return;
    }
    loadResults();
  }, [courseId, selectedAssessmentId, page]);

  async function loadResults() {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        pageSize,
        ...(selectedAssessmentId ? { assessmentId: selectedAssessmentId } : {}),
      };

      const res = await getCourseResults(courseId, params);
      setSummary(res.summary || null);
      setItems(res.items || []);
      setPagination(res.pagination || { page: 1, pageSize, totalItems: 0, totalPages: 0 });
    } catch (err) {
      setSummary(null);
      setItems([]);
      setError(err.message || 'Failed to load course results');
    } finally {
      setLoading(false);
    }
  }

  function handleCourseSelect(nextCourseId) {
    const normalized = String(nextCourseId || '').trim();
    setSelectedCourseId(normalized);
    setSelectedAssessmentId('');
    setPage(1);
    setError(null);
    if (normalized) {
      navigate(`/courses/${normalized}/assessments/results`);
    } else {
      navigate('/assessments/results');
    }
  }

  const selectedCourse = ownedCourses.find((c) => String(c.id) === String(courseId));

  return (
    <div className="assessment-container">
      {/* Page Header */}
      <div className="assessment-page-header">
        <div className="assessment-header-info">
          <h1>Course Assessment Performance & Student Results</h1>
          <p>
            {courseId
              ? `Real-time analytics, pass rates, and individual student evaluation records for ${selectedCourse ? `${selectedCourse.title} (#${courseId})` : `Course #${courseId}`}.`
              : 'Select an owned course to inspect assessment analytics, pass rates, and student evaluation records.'}
          </p>
        </div>
        <div className="assessment-nav-actions">
          <Link
            to={courseId ? `/courses/${courseId}/assessments/manage` : '/assessments/manage'}
            className="btn btn-secondary"
          >
            ← Back to Quiz Builder
          </Link>
        </div>
      </div>

      {/* Course & Assessment Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', background: '#ffffff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="results-course-selector" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
            Course:
          </label>
          <select
            id="results-course-selector"
            value={courseId}
            onChange={(e) => handleCourseSelect(e.target.value)}
            disabled={loadingCourses}
            style={{ minWidth: '240px', maxWidth: '100%', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.875rem', background: '#ffffff' }}
          >
            <option value="">
              {loadingCourses
                ? 'Loading your courses...'
                : ownedCourses.length === 0
                  ? 'No courses available'
                  : 'Select a course...'}
            </option>
            {courseId && !ownedCourses.some((c) => String(c.id) === String(courseId)) && (
              <option value={courseId}>Course #{courseId}</option>
            )}
            {ownedCourses.map((course) => (
              <option key={course.id} value={String(course.id)}>
                {course.title} ({course.status}) — #{course.id}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="results-quiz-filter" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
            Filter by Quiz:
          </label>
          <select
            id="results-quiz-filter"
            value={selectedAssessmentId}
            disabled={!courseId}
            onChange={(e) => {
              setSelectedAssessmentId(e.target.value);
              setPage(1);
            }}
            style={{ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
          >
            <option value="">All Quizzes in Course</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.status})
              </option>
            ))}
          </select>
        </div>

        {courseId && (
          <button type="button" onClick={loadResults} className="btn btn-secondary btn-sm ui-inline">
            <UiIcon name="refresh" size={14} />
            Refresh
          </button>
        )}
        <Link to="/trainer/courses" className="btn btn-secondary btn-sm">
          My Courses
        </Link>
      </div>

      {/* Notifications */}
      {coursesError && (
        <div className="assessment-banner assessment-banner-error" role="alert">
          <UiIcon name="alert-triangle" size={17} />
          <span>{coursesError}</span>
        </div>
      )}
      {error && (
        <div className="assessment-banner assessment-banner-error" role="alert">
          <UiIcon name="alert-triangle" size={17} />
          <span>{error}</span>
        </div>
      )}

      {/* No Course Selected Prompt */}
      {!courseId && !loading && (
        <div style={{ textAlign: 'center', padding: '3.5rem', background: '#ffffff', borderRadius: '0.75rem', border: '1px dashed #cbd5e1' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>
            {loadingCourses
              ? 'Loading Courses...'
              : ownedCourses.length === 0
                ? 'No Owned Courses Found'
                : 'Select a Course to View Student Results'}
          </h3>
          <p style={{ color: '#64748b', margin: '0 0 1.25rem' }}>
            {loadingCourses
              ? 'Fetching the courses assigned to your workspace.'
              : ownedCourses.length === 0
                ? 'Create a course first before reviewing assessment results.'
                : 'Choose one of your courses above or open My Courses to inspect student outcomes.'}
          </p>
          <Link to="/trainer/courses" className="btn btn-secondary">
            Go to My Courses
          </Link>
        </div>
      )}

      {/* Summary KPI Metrics */}
      {courseId && summary && (
        <div className="analytics-metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Quizzes</div>
            <div className="metric-value">{summary.totalAssessments}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Attempts</div>
            <div className="metric-value">{summary.totalAttempts}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Graded</div>
            <div className="metric-value">{summary.gradedAttempts}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Passed</div>
            <div className="metric-value metric-highlight-green">{summary.passedAttempts}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Pass Rate</div>
            <div className="metric-value metric-highlight-blue">{summary.passRate}%</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Average Score</div>
            <div className="metric-value">{summary.averageScorePercentage}%</div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {courseId && loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          Loading student evaluation records...
        </div>
      )}

      {courseId && !loading && !error && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#ffffff', borderRadius: '0.75rem', border: '1px dashed #cbd5e1' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>No Evaluation Records Yet</h3>
          <p style={{ color: '#64748b', margin: 0 }}>
            {selectedAssessmentId
              ? 'No students have attempted this quiz yet.'
              : 'No students have started attempts for quizzes in this course.'}
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div>
          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Trainee Name</th>
                  <th>Assessment Title</th>
                  <th>Attempt</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Outcome</th>
                  <th>Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  let statusBadgeClass = 'badge-in-progress';
                  if (row.status === 'GRADED') statusBadgeClass = 'badge-published';
                  if (row.status === 'EXPIRED') statusBadgeClass = 'badge-expired';

                  return (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{row.traineeName || `Trainee #${row.traineeId}`}</td>
                      <td>{row.assessmentTitle}</td>
                      <td>Attempt #{row.attemptNumber}</td>
                      <td>
                        <span className={`assessment-badge ${statusBadgeClass}`}>{row.status}</span>
                      </td>
                      <td>
                        {row.scorePercentage !== null ? (
                          <span>
                            <strong>{row.scorePercentage}%</strong> ({row.earnedPoints}/{row.totalPoints} pts)
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {row.isPassed === true && (
                          <span className="assessment-badge badge-passed ui-inline">
                            <UiIcon name="check" size={13} />
                            PASSED
                          </span>
                        )}
                        {row.isPassed === false && (
                          <span className="assessment-badge badge-failed ui-inline">
                            <UiIcon name="x" size={13} />
                            FAILED
                          </span>
                        )}
                        {row.isPassed === null && (
                          <span className="assessment-badge badge-expired">—</span>
                        )}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '0.8rem' }}>
                        {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : 'In Progress'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="pagination-bar">
              <div>
                Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} attempts total)
              </div>
              <div className="pagination-controls">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="btn btn-secondary btn-sm"
                >
                  ← Previous
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="btn btn-secondary btn-sm"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
