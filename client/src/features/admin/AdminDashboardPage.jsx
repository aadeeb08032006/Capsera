import React, { useEffect, useId, useState } from 'react';
import { getAssessmentPerformance, getDashboardSummary } from './adminDashboardApi.js';
import './adminDashboard.css';

function formatCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '0';
}

function formatPercentage(value, { nullable = false } = {}) {
  if (value === null || value === undefined) {
    return nullable ? 'N/A' : '0%';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return nullable ? 'N/A' : '0%';
  }
  const formatted = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted}%`;
}

function getFriendlyErrorMessage(err) {
  if (!err) {
    return 'Unable to load dashboard metrics right now.';
  }
  if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
    return 'Authentication required. Please sign in with an active administrator account to view the Admin Dashboard.';
  }
  if (err.status === 403) {
    if (err.code === 'ACCOUNT_PENDING' || err.code === 'ACCOUNT_REJECTED' || err.code === 'ACCOUNT_SUSPENDED') {
      return err.message || 'Your administrator account is not currently active.';
    }
    return 'Access denied. Only active administrators can view platform dashboard metrics.';
  }
  return err.message || 'Unable to load dashboard metrics right now.';
}

function MetricItem({ label, value }) {
  return (
    <div className="admin-metric-item">
      <dt className="admin-metric-label">{label}</dt>
      <dd className="admin-metric-value">{value}</dd>
    </div>
  );
}

/**
 * Minimal Admin Dashboard page (`ACTIVE` `ADMIN` role).
 * Authentication/authorization is enforced on the backend; this component relies
 * on shared frontend session wiring via `apiClient.js` and remains unmounted until
 * Member 1's frontend authentication and protected admin routing are ready.
 */
export default function AdminDashboardPage() {
  const pageHeadingId = useId();
  const usersHeadingId = useId();
  const coursesHeadingId = useId();
  const enrollmentsHeadingId = useId();
  const assessmentsHeadingId = useId();
  const certificatesHeadingId = useId();
  const participationHeadingId = useId();
  const performanceHeadingId = useId();
  const subjectsHeadingId = useId();

  const [refreshTick, setRefreshTick] = useState(0);
  const [summary, setSummary] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setError(null);

    Promise.all([
      getDashboardSummary({ signal: controller.signal }),
      getAssessmentPerformance({ signal: controller.signal }),
    ])
      .then(([summaryData, performanceData]) => {
        if (!active) return;
        setSummary(summaryData ?? null);
        setPerformance(performanceData ?? null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setError(getFriendlyErrorMessage(err));
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshTick]);

  const handleRefresh = () => {
    setRefreshTick((tick) => tick + 1);
  };

  const overall = performance?.overall;
  const bySubject = Array.isArray(performance?.bySubject) ? performance.bySubject : [];

  return (
    <main className="admin-dashboard-page" aria-labelledby={pageHeadingId}>
      <header className="admin-dashboard-header">
        <div>
          <h1 id={pageHeadingId}>Admin Dashboard</h1>
          <p className="admin-dashboard-subtitle">
            Live platform counts and assessment outcome summaries from PostgreSQL.
          </p>
        </div>
        <button
          type="button"
          className="admin-dashboard-btn admin-dashboard-btn-primary"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {isLoading && (
        <section className="admin-dashboard-card" aria-busy="true">
          <p className="admin-dashboard-status" role="status" aria-live="polite">
            Loading dashboard metrics...
          </p>
        </section>
      )}

      {!isLoading && error && (
        <section className="admin-dashboard-card">
          <div className="admin-dashboard-banner-error" role="alert">
            <p className="admin-dashboard-error-text">{error}</p>
            <button
              type="button"
              className="admin-dashboard-btn admin-dashboard-btn-secondary"
              onClick={handleRefresh}
            >
              Retry
            </button>
          </div>
        </section>
      )}

      {!isLoading && !error && !summary && !performance && (
        <section className="admin-dashboard-card">
          <p className="admin-dashboard-empty">No dashboard statistics are currently available.</p>
        </section>
      )}

      {!isLoading && !error && summary && (
        <>
          <div className="admin-sections-grid">
            <section className="admin-dashboard-card" aria-labelledby={usersHeadingId}>
              <h2 id={usersHeadingId}>Users</h2>
              <dl className="admin-metric-grid">
                <MetricItem label="Total Users" value={formatCount(summary.users?.total)} />
                <MetricItem label="Trainees" value={formatCount(summary.users?.byRole?.TRAINEE)} />
                <MetricItem label="Trainers" value={formatCount(summary.users?.byRole?.TRAINER)} />
                <MetricItem label="Admins" value={formatCount(summary.users?.byRole?.ADMIN)} />
                <MetricItem label="Pending" value={formatCount(summary.users?.byStatus?.PENDING)} />
                <MetricItem label="Active" value={formatCount(summary.users?.byStatus?.ACTIVE)} />
                <MetricItem label="Rejected" value={formatCount(summary.users?.byStatus?.REJECTED)} />
                <MetricItem label="Suspended" value={formatCount(summary.users?.byStatus?.SUSPENDED)} />
              </dl>
            </section>

            <section className="admin-dashboard-card" aria-labelledby={coursesHeadingId}>
              <h2 id={coursesHeadingId}>Courses</h2>
              <dl className="admin-metric-grid">
                <MetricItem label="Total Courses" value={formatCount(summary.courses?.total)} />
                <MetricItem label="Draft" value={formatCount(summary.courses?.byStatus?.DRAFT)} />
                <MetricItem label="Published" value={formatCount(summary.courses?.byStatus?.PUBLISHED)} />
                <MetricItem label="Archived" value={formatCount(summary.courses?.byStatus?.ARCHIVED)} />
              </dl>
            </section>

            <section className="admin-dashboard-card" aria-labelledby={enrollmentsHeadingId}>
              <h2 id={enrollmentsHeadingId}>Enrollments</h2>
              <dl className="admin-metric-grid">
                <MetricItem label="Total Enrollments" value={formatCount(summary.enrollments?.total)} />
                <MetricItem label="Active" value={formatCount(summary.enrollments?.byStatus?.ACTIVE)} />
                <MetricItem label="Completed" value={formatCount(summary.enrollments?.byStatus?.COMPLETED)} />
                <MetricItem label="Cancelled" value={formatCount(summary.enrollments?.byStatus?.CANCELLED)} />
                <MetricItem
                  label="Completion Rate"
                  value={formatPercentage(summary.enrollments?.completionRate)}
                />
              </dl>
            </section>

            <section className="admin-dashboard-card" aria-labelledby={assessmentsHeadingId}>
              <h2 id={assessmentsHeadingId}>Assessments &amp; Attempts</h2>
              <dl className="admin-metric-grid">
                <MetricItem label="Total Assessments" value={formatCount(summary.assessments?.total)} />
                <MetricItem label="Draft Assessments" value={formatCount(summary.assessments?.byStatus?.DRAFT)} />
                <MetricItem
                  label="Published Assessments"
                  value={formatCount(summary.assessments?.byStatus?.PUBLISHED)}
                />
                <MetricItem label="Closed Assessments" value={formatCount(summary.assessments?.byStatus?.CLOSED)} />
                <MetricItem label="Total Attempts" value={formatCount(summary.attempts?.total)} />
                <MetricItem
                  label="In Progress"
                  value={formatCount(summary.attempts?.byStatus?.IN_PROGRESS)}
                />
                <MetricItem label="Submitted" value={formatCount(summary.attempts?.byStatus?.SUBMITTED)} />
                <MetricItem label="Graded" value={formatCount(summary.attempts?.byStatus?.GRADED)} />
                <MetricItem label="Expired" value={formatCount(summary.attempts?.byStatus?.EXPIRED)} />
                <MetricItem label="Passed Attempts" value={formatCount(summary.attempts?.passedCount)} />
              </dl>
            </section>

            <section className="admin-dashboard-card" aria-labelledby={certificatesHeadingId}>
              <h2 id={certificatesHeadingId}>Certificates</h2>
              <dl className="admin-metric-grid">
                <MetricItem label="Total Issued" value={formatCount(summary.certificates?.totalIssued)} />
                <MetricItem label="Valid" value={formatCount(summary.certificates?.validCount)} />
                <MetricItem label="Revoked" value={formatCount(summary.certificates?.revokedCount)} />
              </dl>
            </section>

            <section className="admin-dashboard-card" aria-labelledby={participationHeadingId}>
              <h2 id={participationHeadingId}>Participation</h2>
              <dl className="admin-metric-grid">
                <MetricItem
                  label="Enrolled Trainees"
                  value={formatCount(summary.participation?.enrolledTrainees)}
                />
                <MetricItem
                  label="Assessment Trainees"
                  value={formatCount(summary.participation?.attemptingTrainees)}
                />
              </dl>
            </section>
          </div>
        </>
      )}

      {!isLoading && !error && performance && (
        <>
          <section className="admin-dashboard-card" aria-labelledby={performanceHeadingId}>
            <h2 id={performanceHeadingId}>Assessment Performance</h2>
            <dl className="admin-metric-grid">
              <MetricItem label="Total Assessments" value={formatCount(overall?.totalAssessments)} />
              <MetricItem label="Total Attempts" value={formatCount(overall?.totalAttempts)} />
              <MetricItem label="Graded Attempts" value={formatCount(overall?.gradedAttempts)} />
              <MetricItem label="Passed Attempts" value={formatCount(overall?.passedAttempts)} />
              <MetricItem label="Pass Rate" value={formatPercentage(overall?.passRate)} />
              <MetricItem
                label="Average Score"
                value={formatPercentage(overall?.averageScorePercentage, { nullable: true })}
              />
            </dl>
          </section>

          <section className="admin-dashboard-card" aria-labelledby={subjectsHeadingId}>
            <h2 id={subjectsHeadingId}>Performance by Subject</h2>
            {bySubject.length === 0 ? (
              <p className="admin-dashboard-empty">
                No course subject records exist yet to summarize.
              </p>
            ) : (
              <div className="admin-table-wrapper">
                <table className="admin-performance-table">
                  <caption className="admin-sr-only">
                    Course, assessment, attempt, pass rate, and average score summary by subject
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Subject</th>
                      <th scope="col">Courses</th>
                      <th scope="col">Assessments</th>
                      <th scope="col">Attempts</th>
                      <th scope="col">Graded</th>
                      <th scope="col">Passed</th>
                      <th scope="col">Pass Rate</th>
                      <th scope="col">Average Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySubject.map((row) => (
                      <tr key={row.subject}>
                        <th scope="row">{row.subject}</th>
                        <td>{formatCount(row.courseCount)}</td>
                        <td>{formatCount(row.assessmentCount)}</td>
                        <td>{formatCount(row.attemptCount)}</td>
                        <td>{formatCount(row.gradedAttemptCount)}</td>
                        <td>{formatCount(row.passedAttemptCount)}</td>
                        <td>{formatPercentage(row.passRate)}</td>
                        <td>{formatPercentage(row.averageScorePercentage, { nullable: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

