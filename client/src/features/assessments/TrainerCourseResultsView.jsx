import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCourseResults, listAssessmentsByCourse } from './assessmentsApi.js';
import './assessments.css';

export default function TrainerCourseResultsView() {
  const { courseId: routeCourseId } = useParams();
  const [courseId, setCourseId] = useState(routeCourseId || '1');

  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize, totalItems: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load course assessments for filter dropdown
  useEffect(() => {
    async function loadFilterAssessments() {
      try {
        const res = await listAssessmentsByCourse(courseId);
        setAssessments(res.items || []);
      } catch {
        // Fallback silently if course has no quizzes
      }
    }
    loadFilterAssessments();
  }, [courseId]);

  // Load course analytics & student results
  useEffect(() => {
    loadResults();
  }, [courseId, selectedAssessmentId, page]);

  async function loadResults() {
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
      setError(err.message || 'Failed to load course results');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="assessment-container">
      {/* Page Header */}
      <div className="assessment-page-header">
        <div className="assessment-header-info">
          <h1>Course Assessment Performance & Student Results</h1>
          <p>Real-time analytics, pass rates, and individual student evaluation records for Course #{courseId}.</p>
        </div>
        <div className="assessment-nav-actions">
          <Link to={`/courses/${courseId}/assessments/manage`} className="btn btn-secondary">
            ← Back to Quiz Builder
          </Link>
        </div>
      </div>

      {/* Course & Assessment Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', background: '#ffffff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Course ID:</label>
          <input
            type="text"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setPage(1);
            }}
            style={{ width: '70px', padding: '0.35rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Filter by Quiz:</label>
          <select
            value={selectedAssessmentId}
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

        <button onClick={loadResults} className="btn btn-secondary btn-sm">
          🔄 Refresh
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="assessment-banner assessment-banner-error" role="alert">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Summary KPI Metrics */}
      {summary && (
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
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          Loading student evaluation records...
        </div>
      )}

      {!loading && items.length === 0 && (
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
                          <span className="assessment-badge badge-passed">✓ PASSED</span>
                        )}
                        {row.isPassed === false && (
                          <span className="assessment-badge badge-failed">✗ FAILED</span>
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
