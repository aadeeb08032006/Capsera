import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMyEnrollments } from './coursesApi.js';
import UiIcon from '../../components/UiIcon.jsx';

export default function MyLearningPage() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEnrollments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyEnrollments();
      setEnrollments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load your enrolled courses');
      setEnrollments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  const activeCount = enrollments.filter((e) => e.status === 'ACTIVE').length;
  const completedCount = enrollments.filter((e) => e.status === 'COMPLETED').length;

  return (
    <main className="courses-page-container">
      <header className="courses-mylearning-header">
        <span className="courses-badge-pill">Trainee Dashboard</span>
        <h1>My Learning</h1>
        <p className="courses-subtitle">
          Track your course completion, progress metrics, and continuing curriculum modules.
        </p>

        {/* Learning Statistics Summary */}
        <div className="courses-stats-grid" aria-label="Learning statistics summary">
          <div className="courses-stat-card">
            <span className="courses-stat-number">{enrollments.length}</span>
            <span className="courses-stat-label">Total Enrolled</span>
          </div>
          <div className="courses-stat-card">
            <span className="courses-stat-number">{activeCount}</span>
            <span className="courses-stat-label">In Progress</span>
          </div>
          <div className="courses-stat-card">
            <span className="courses-stat-number courses-stat-completed">
              {completedCount}
            </span>
            <span className="courses-stat-label">Completed</span>
          </div>
        </div>
      </header>

      {/* Loading State */}
      {loading && (
        <div className="courses-loading-container" role="status" aria-live="polite">
          <div className="courses-spinner" aria-hidden="true" />
          <p>Loading your courses and progress records...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="courses-state-card courses-state-error" role="alert">
          <h2>Error Loading My Learning</h2>
          <p>{error}</p>
          <button
            type="button"
            className="courses-btn courses-btn-secondary"
            onClick={fetchEnrollments}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && enrollments.length === 0 && (
        <div className="courses-state-card courses-state-empty" role="status">
          <div className="courses-empty-icon" aria-hidden="true">
            <UiIcon name="graduation-cap" size={34} />
          </div>
          <h2>No Enrolled Courses Yet</h2>
          <p>
            You have not enrolled in any training tracks yet. Explore the course catalogue
            to begin building your skills.
          </p>
          <Link to="/courses" className="courses-btn courses-btn-primary">
            Browse Course Catalogue
          </Link>
        </div>
      )}

      {/* Enrollments List with Progress Bars */}
      {!loading && !error && enrollments.length > 0 && (
        <section className="courses-learning-grid" aria-label="Enrolled courses list">
          {enrollments.map((item) => {
            const courseTitle = item.courseTitle || item.course?.title || `Course #${item.courseId}`;
            const progress = Number(item.progressPercentage) || 0;
            const isComplete = item.status === 'COMPLETED' || progress === 100;

            return (
              <article key={item.id} className="courses-card courses-learning-card">
                <div className="courses-card-body">
                  <div className="courses-learning-card-header">
                    {item.course?.subject && (
                      <span className="courses-badge-subject">
                        {item.course.subject}
                      </span>
                    )}
                    <span
                      className={`courses-badge-status courses-status-${item.status.toLowerCase()}`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <h3 className="courses-card-title">
                    <Link to={`/courses/${item.courseId}`}>{courseTitle}</Link>
                  </h3>

                  {item.course?.summary && (
                    <p className="courses-card-summary">{item.course.summary}</p>
                  )}

                  {/* Progress Bar Component */}
                  <div className="courses-progress-wrapper">
                    <div className="courses-progress-header">
                      <span className="courses-progress-label">Course Progress</span>
                      <span className="courses-progress-percent">
                        {progress}%
                      </span>
                    </div>

                    <div
                      className="courses-progress-bar-track"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress for ${courseTitle}: ${progress}%`}
                    >
                      <div
                        className={`courses-progress-bar-fill ${
                          isComplete ? 'courses-progress-bar-complete' : ''
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>

                    <div className="courses-progress-footer">
                      <span>
                        {item.completedLessons ?? 0} of {item.totalLessons ?? 0} lessons completed
                      </span>
                      {isComplete && (
                        <span className="courses-complete-badge ui-inline">
                          <UiIcon name="check-circle" size={14} />
                          Finished
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Continue Learning CTA */}
                  <div className="courses-card-footer">
                    <Link
                      to={`/courses/${item.courseId}`}
                      className="courses-btn courses-btn-primary courses-btn-block"
                      aria-label={`Continue studying ${courseTitle}`}
                    >
                      {isComplete ? 'Review Course Material' : 'Continue Learning →'}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
