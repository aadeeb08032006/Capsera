import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ANNOUNCEMENT_CATEGORIES,
  listPublicAnnouncements,
} from '../announcements/announcementsApi.js';
import AdminLayout, { DashboardIcon } from './AdminLayout.jsx';
import { getAssessmentPerformance, getDashboardSummary } from './adminDashboardApi.js';
import './adminDashboard.css';

const CATEGORY_LABELS = Object.fromEntries(
  ANNOUNCEMENT_CATEGORIES.map((item) => [item.value, item.label]),
);

const QUICK_ACTIONS = [
  {
    label: 'Manage Users',
    description: 'Approve pending accounts, assign roles, and review user status.',
    path: '/admin/users',
    icon: 'users',
  },
  {
    label: 'Manage Skills',
    description: 'Add and organize canonical skills across the platform catalogue.',
    path: '/admin/skills',
    icon: 'skills',
  },
  {
    label: 'Manage Announcements',
    description: 'Draft, publish, and archive homepage announcements and updates.',
    path: '/admin/announcements',
    icon: 'announcements',
  },
  {
    label: 'Manage Courses',
    description: 'Review, publish, and oversee training courses and lessons.',
    path: '/trainer/courses',
    icon: 'courses',
  },
];

function formatCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '0';
}

function toSafeInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0;
}

function formatPercentage(value, { nullable = false } = {}) {
  if (value === null || value === undefined) {
    return nullable ? 'N/A' : '0%';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return nullable ? 'N/A' : '0%';
  }
  const formatted = Number.isInteger(numeric)
    ? String(numeric)
    : numeric.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted}%`;
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

function calculateSharePercent(part, total) {
  const safePart = toSafeInt(part);
  const safeTotal = toSafeInt(total);
  if (safeTotal <= 0) return 0;
  return Math.round((safePart / safeTotal) * 100);
}

function formatShortDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncateText(text, maxLength = 120) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return '';
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength).trimEnd()}…`;
}

function getFriendlyErrorMessage(err) {
  if (!err) {
    return 'Unable to load dashboard metrics right now.';
  }
  if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
    return 'Authentication required. Please sign in with an active administrator account to view the Admin Dashboard.';
  }
  if (err.status === 403) {
    if (
      err.code === 'ACCOUNT_PENDING' ||
      err.code === 'ACCOUNT_REJECTED' ||
      err.code === 'ACCOUNT_SUSPENDED'
    ) {
      return err.message || 'Your administrator account is not currently active.';
    }
    return 'Access denied. Only active administrators can view platform dashboard metrics.';
  }
  return err.message || 'Unable to load dashboard metrics right now.';
}

/**
 * CAPSERA Admin Dashboard page (`ACTIVE` `ADMIN` role).
 * Provides live PostgreSQL counts, assessment performance analytics, recent
 * published announcements, and role-specific admin navigation via `<AdminLayout>`.
 */
export default function AdminDashboardPage() {
  const kpiHeadingId = useId();
  const usersHeadingId = useId();
  const coursesHeadingId = useId();
  const performanceHeadingId = useId();
  const subjectsHeadingId = useId();
  const announcementsHeadingId = useId();
  const quickActionsHeadingId = useId();

  const [refreshTick, setRefreshTick] = useState(0);
  const [summary, setSummary] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [recentAnnouncements, setRecentAnnouncements] = useState([]);
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
      listPublicAnnouncements({ page: 1, pageSize: 3 }, { signal: controller.signal }).catch(
        () => ({ items: [] }),
      ),
    ])
      .then(([summaryData, performanceData, announcementsData]) => {
        if (!active) return;
        setSummary(summaryData ?? null);
        setPerformance(performanceData ?? null);
        setRecentAnnouncements(
          Array.isArray(announcementsData?.items) ? announcementsData.items.slice(0, 3) : [],
        );
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

  const totalUsers = toSafeInt(summary?.users?.total);
  const traineeUsers = toSafeInt(summary?.users?.byRole?.TRAINEE);
  const trainerUsers = toSafeInt(summary?.users?.byRole?.TRAINER);
  const adminUsers = toSafeInt(summary?.users?.byRole?.ADMIN);
  const activeUsers = toSafeInt(summary?.users?.byStatus?.ACTIVE);
  const pendingUsers = toSafeInt(summary?.users?.byStatus?.PENDING);
  const rejectedUsers = toSafeInt(summary?.users?.byStatus?.REJECTED);
  const suspendedUsers = toSafeInt(summary?.users?.byStatus?.SUSPENDED);

  const traineeShare = calculateSharePercent(traineeUsers, totalUsers);
  const trainerShare = calculateSharePercent(trainerUsers, totalUsers);
  const adminShare = calculateSharePercent(adminUsers, totalUsers);

  const totalCourses = toSafeInt(summary?.courses?.total);
  const publishedCourses = toSafeInt(summary?.courses?.byStatus?.PUBLISHED);
  const draftCourses = toSafeInt(summary?.courses?.byStatus?.DRAFT);
  const archivedCourses = toSafeInt(summary?.courses?.byStatus?.ARCHIVED);

  const totalEnrollments = toSafeInt(summary?.enrollments?.total);
  const activeEnrollments = toSafeInt(summary?.enrollments?.byStatus?.ACTIVE);
  const completedEnrollments = toSafeInt(summary?.enrollments?.byStatus?.COMPLETED);
  const cancelledEnrollments = toSafeInt(summary?.enrollments?.byStatus?.CANCELLED);
  const completionRateValue = clampPercent(summary?.enrollments?.completionRate);

  const totalCertificates = toSafeInt(summary?.certificates?.totalIssued);
  const validCertificates = toSafeInt(summary?.certificates?.validCount);

  return (
    <AdminLayout
      title="Admin Dashboard"
      subtitle="Live platform counts, enrollment progress, and assessment outcome summaries."
      headerActions={
        <button
          type="button"
          className="admin-dashboard-btn admin-dashboard-btn-primary"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <DashboardIcon name="refresh" />
          <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      }
    >
      {isLoading && (
        <section className="admin-dashboard-card admin-loading-card" aria-busy="true">
          <div className="admin-loading-spinner" aria-hidden="true" />
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
          {/* 1. Summary KPI Cards */}
          <section aria-labelledby={kpiHeadingId} className="admin-kpi-section">
            <h2 id={kpiHeadingId} className="admin-sr-only">
              Platform Summary KPIs
            </h2>
            <div className="admin-kpi-grid">
              <article className="admin-kpi-card">
                <div className="admin-kpi-top">
                  <span className="admin-kpi-label">Total Users</span>
                  <span className="admin-kpi-icon admin-kpi-icon--blue">
                    <DashboardIcon name="users" />
                  </span>
                </div>
                <p className="admin-kpi-value">{formatCount(summary.users?.total)}</p>
                <p className="admin-kpi-secondary">
                  <strong>{formatCount(summary.users?.byStatus?.ACTIVE)}</strong> active &middot;{' '}
                  <strong>{formatCount(summary.users?.byStatus?.PENDING)}</strong> pending
                </p>
              </article>

              <article className="admin-kpi-card">
                <div className="admin-kpi-top">
                  <span className="admin-kpi-label">Published Courses</span>
                  <span className="admin-kpi-icon admin-kpi-icon--lime">
                    <DashboardIcon name="courses" />
                  </span>
                </div>
                <p className="admin-kpi-value">
                  {formatCount(summary.courses?.byStatus?.PUBLISHED)}
                </p>
                <p className="admin-kpi-secondary">
                  <strong>{formatCount(summary.courses?.total)}</strong> total &middot;{' '}
                  <strong>{formatCount(summary.courses?.byStatus?.DRAFT)}</strong> draft
                </p>
              </article>

              <article className="admin-kpi-card">
                <div className="admin-kpi-top">
                  <span className="admin-kpi-label">Total Enrollments</span>
                  <span className="admin-kpi-icon admin-kpi-icon--blue">
                    <DashboardIcon name="enrollments" />
                  </span>
                </div>
                <p className="admin-kpi-value">{formatCount(summary.enrollments?.total)}</p>
                <p className="admin-kpi-secondary">
                  <strong>{formatPercentage(summary.enrollments?.completionRate)}</strong>{' '}
                  completion rate
                </p>
              </article>

              <article className="admin-kpi-card">
                <div className="admin-kpi-top">
                  <span className="admin-kpi-label">Certificates Issued</span>
                  <span className="admin-kpi-icon admin-kpi-icon--lime">
                    <DashboardIcon name="certificates" />
                  </span>
                </div>
                <p className="admin-kpi-value">
                  {formatCount(summary.certificates?.totalIssued)}
                </p>
                <p className="admin-kpi-secondary">
                  <strong>{formatCount(summary.certificates?.validCount)}</strong> valid &middot;{' '}
                  <strong>{formatCount(summary.certificates?.revokedCount)}</strong> revoked
                </p>
              </article>
            </div>
          </section>

          {/* 2. User Overview + Course & Enrollment Overview */}
          <div className="admin-overview-grid">
            <section className="admin-dashboard-card" aria-labelledby={usersHeadingId}>
              <div className="admin-card-header">
                <div>
                  <h2 id={usersHeadingId}>User Overview</h2>
                  <p className="admin-card-subtitle">
                    Role distribution and account approval status
                  </p>
                </div>
                <Link to="/admin/users" className="admin-card-action-link">
                  User Management &rarr;
                </Link>
              </div>

              <div className="admin-distribution-block">
                <div className="admin-distribution-header">
                  <span className="admin-distribution-title">Role Distribution</span>
                  <span className="admin-distribution-total">
                    <strong>{formatCount(totalUsers)}</strong> total users
                  </span>
                </div>
                <div
                  className="admin-stacked-bar"
                  role="img"
                  aria-label={`Role distribution: ${traineeUsers} Trainees (${traineeShare}%), ${trainerUsers} Trainers (${trainerShare}%), ${adminUsers} Admins (${adminShare}%)`}
                >
                  {totalUsers > 0 ? (
                    <>
                      <div
                        className="admin-stacked-segment admin-stacked-segment--blue"
                        style={{ width: `${(traineeUsers / totalUsers) * 100}%` }}
                      />
                      <div
                        className="admin-stacked-segment admin-stacked-segment--lime"
                        style={{ width: `${(trainerUsers / totalUsers) * 100}%` }}
                      />
                      <div
                        className="admin-stacked-segment admin-stacked-segment--navy"
                        style={{ width: `${(adminUsers / totalUsers) * 100}%` }}
                      />
                    </>
                  ) : (
                    <div className="admin-stacked-segment admin-stacked-segment--empty" />
                  )}
                </div>

                <div className="admin-role-cards">
                  <div className="admin-role-card">
                    <div className="admin-role-card-top">
                      <span className="admin-legend-dot admin-legend-dot--blue" />
                      <span className="admin-role-name">Trainees</span>
                    </div>
                    <div className="admin-role-card-Stat">
                      <strong>{formatCount(traineeUsers)}</strong>
                      <span>{traineeShare}%</span>
                    </div>
                  </div>

                  <div className="admin-role-card">
                    <div className="admin-role-card-top">
                      <span className="admin-legend-dot admin-legend-dot--lime" />
                      <span className="admin-role-name">Trainers</span>
                    </div>
                    <div className="admin-role-card-Stat">
                      <strong>{formatCount(trainerUsers)}</strong>
                      <span>{trainerShare}%</span>
                    </div>
                  </div>

                  <div className="admin-role-card">
                    <div className="admin-role-card-top">
                      <span className="admin-legend-dot admin-legend-dot--navy" />
                      <span className="admin-role-name">Admins</span>
                    </div>
                    <div className="admin-role-card-Stat">
                      <strong>{formatCount(adminUsers)}</strong>
                      <span>{adminShare}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-status-strip-wrap">
                <span className="admin-section-micro-label">Account Status Breakdown</span>
                <dl className="admin-status-strip">
                  <div className="admin-status-pill">
                    <dt>
                      <span className="admin-status-dot admin-status-dot--active" />
                      Active
                    </dt>
                    <dd>{formatCount(activeUsers)}</dd>
                  </div>
                  <div className="admin-status-pill">
                    <dt>
                      <span className="admin-status-dot admin-status-dot--pending" />
                      Pending
                    </dt>
                    <dd>{formatCount(pendingUsers)}</dd>
                  </div>
                  <div className="admin-status-pill">
                    <dt>
                      <span className="admin-status-dot admin-status-dot--suspended" />
                      Suspended
                    </dt>
                    <dd>{formatCount(suspendedUsers)}</dd>
                  </div>
                  <div className="admin-status-pill">
                    <dt>
                      <span className="admin-status-dot admin-status-dot--rejected" />
                      Rejected
                    </dt>
                    <dd>{formatCount(rejectedUsers)}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section className="admin-dashboard-card" aria-labelledby={coursesHeadingId}>
              <div className="admin-card-header">
                <div>
                  <h2 id={coursesHeadingId}>Courses &amp; Enrollments</h2>
                  <p className="admin-card-subtitle">
                    Completion rate, course states, and learner participation
                  </p>
                </div>
                <Link to="/trainer/courses" className="admin-card-action-link">
                  Manage Courses &rarr;
                </Link>
              </div>

              <div className="admin-progress-callout">
                <div className="admin-progress-callout-top">
                  <div>
                    <span className="admin-progress-callout-label">
                      Enrollment Completion Rate
                    </span>
                    <p className="admin-progress-caption">
                      {formatCount(completedEnrollments)} completed of{' '}
                      {formatCount(activeEnrollments + completedEnrollments)} active/completed
                      enrollments ({formatCount(cancelledEnrollments)} cancelled)
                    </p>
                  </div>
                  <span className="admin-progress-callout-value">
                    {formatPercentage(summary.enrollments?.completionRate)}
                  </span>
                </div>
                <div
                  className="admin-progress-track"
                  role="progressbar"
                  aria-valuenow={Math.round(completionRateValue)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Course completion rate"
                >
                  <div
                    className="admin-progress-fill"
                    style={{ width: `${completionRateValue}%` }}
                  />
                </div>
              </div>

              <div className="admin-dual-summary-grid">
                <div className="admin-summary-group">
                  <div className="admin-summary-group-head">
                    <span>Courses</span>
                    <strong>{formatCount(totalCourses)} total</strong>
                  </div>
                  <dl className="admin-compact-kv-list">
                    <div className="admin-compact-kv-row">
                      <dt>Published</dt>
                      <dd>{formatCount(publishedCourses)}</dd>
                    </div>
                    <div className="admin-compact-kv-row">
                      <dt>Draft</dt>
                      <dd>{formatCount(draftCourses)}</dd>
                    </div>
                    <div className="admin-compact-kv-row">
                      <dt>Archived</dt>
                      <dd>{formatCount(archivedCourses)}</dd>
                    </div>
                    <div className="admin-compact-kv-row">
                      <dt>Valid Certificates</dt>
                      <dd>
                        {formatCount(validCertificates)} / {formatCount(totalCertificates)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="admin-summary-group">
                  <div className="admin-summary-group-head">
                    <span>Enrollments &amp; Reach</span>
                    <strong>{formatCount(totalEnrollments)} total</strong>
                  </div>
                  <dl className="admin-compact-kv-list">
                    <div className="admin-compact-kv-row">
                      <dt>Active / Completed</dt>
                      <dd>
                        {formatCount(activeEnrollments)} / {formatCount(completedEnrollments)}
                      </dd>
                    </div>
                    <div className="admin-compact-kv-row">
                      <dt>Cancelled</dt>
                      <dd>{formatCount(cancelledEnrollments)}</dd>
                    </div>
                    <div className="admin-compact-kv-row">
                      <dt>Enrolled Trainees</dt>
                      <dd>{formatCount(summary.participation?.enrolledTrainees)}</dd>
                    </div>
                    <div className="admin-compact-kv-row">
                      <dt>Assessment Trainees</dt>
                      <dd>{formatCount(summary.participation?.attemptingTrainees)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* 3. Assessment Performance & Subject Breakdown */}
      {!isLoading && !error && (performance || summary) && (
        <section className="admin-dashboard-card" aria-labelledby={performanceHeadingId}>
          <div className="admin-card-header">
            <div>
              <h2 id={performanceHeadingId}>Assessment Performance</h2>
              <p className="admin-card-subtitle">
                Platform-wide quiz outcomes, grading lifecycle, and subject breakdown
              </p>
            </div>
          </div>

          <div className="admin-assessment-highlights">
            <div className="admin-highlight-stat admin-highlight-stat--featured">
              <span className="admin-highlight-label">Overall Pass Rate</span>
              <strong className="admin-highlight-value">
                {formatPercentage(overall?.passRate)}
              </strong>
              <span className="admin-highlight-sub">
                {formatCount(overall?.passedAttempts ?? summary?.attempts?.passedCount)} passed
                of {formatCount(overall?.gradedAttempts ?? summary?.attempts?.byStatus?.GRADED)}{' '}
                graded
              </span>
            </div>

            <div className="admin-highlight-stat">
              <span className="admin-highlight-label">Average Score</span>
              <strong className="admin-highlight-value">
                {formatPercentage(overall?.averageScorePercentage, { nullable: true })}
              </strong>
              <span className="admin-highlight-sub">Across graded attempts</span>
            </div>

            <div className="admin-highlight-stat">
              <span className="admin-highlight-label">Total Assessments</span>
              <strong className="admin-highlight-value">
                {formatCount(overall?.totalAssessments ?? summary?.assessments?.total)}
              </strong>
              <span className="admin-highlight-sub">
                {formatCount(summary?.assessments?.byStatus?.PUBLISHED)} published &middot;{' '}
                {formatCount(summary?.assessments?.byStatus?.DRAFT)} draft &middot;{' '}
                {formatCount(summary?.assessments?.byStatus?.CLOSED)} closed
              </span>
            </div>

            <div className="admin-highlight-stat">
              <span className="admin-highlight-label">Total Attempts</span>
              <strong className="admin-highlight-value">
                {formatCount(overall?.totalAttempts ?? summary?.attempts?.total)}
              </strong>
              <span className="admin-highlight-sub">
                {formatCount(summary?.attempts?.byStatus?.IN_PROGRESS)} in progress &middot;{' '}
                {formatCount(summary?.attempts?.byStatus?.EXPIRED)} expired
              </span>
            </div>
          </div>

          <div className="admin-subject-section">
            <h3 id={subjectsHeadingId} className="admin-subheading">
              Performance by Subject
            </h3>
            {bySubject.length === 0 ? (
              <p className="admin-dashboard-empty">
                No course subject records exist yet to summarize.
              </p>
            ) : (
              <div className="admin-table-wrapper">
                <table
                  className="admin-performance-table"
                  aria-labelledby={subjectsHeadingId}
                >
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
                    {bySubject.map((row) => {
                      const passPct = clampPercent(row.passRate);
                      return (
                        <tr key={row.subject}>
                          <th scope="row">{row.subject}</th>
                          <td>{formatCount(row.courseCount)}</td>
                          <td>{formatCount(row.assessmentCount)}</td>
                          <td>{formatCount(row.attemptCount)}</td>
                          <td>{formatCount(row.gradedAttemptCount)}</td>
                          <td>{formatCount(row.passedAttemptCount)}</td>
                          <td>
                            <div className="admin-table-rate-cell">
                              <span>{formatPercentage(row.passRate)}</span>
                              <span className="admin-mini-bar" aria-hidden="true">
                                <span
                                  className="admin-mini-bar-fill"
                                  style={{ width: `${passPct}%` }}
                                />
                              </span>
                            </div>
                          </td>
                          <td>
                            {formatPercentage(row.averageScorePercentage, { nullable: true })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. Recent Announcements & Quick Actions */}
      {!isLoading && !error && (
        <div className="admin-bottom-grid">
          <section className="admin-dashboard-card" aria-labelledby={announcementsHeadingId}>
            <div className="admin-card-header">
              <div>
                <h2 id={announcementsHeadingId}>Recent Announcements</h2>
                <p className="admin-card-subtitle">
                  Latest published announcements on the platform homepage
                </p>
              </div>
              <Link to="/admin/announcements" className="admin-card-action-link">
                Manage Announcements &rarr;
              </Link>
            </div>

            {recentAnnouncements.length === 0 ? (
              <div className="admin-empty-box">
                <p className="admin-dashboard-empty">
                  No published announcements are currently active.
                </p>
                <Link
                  to="/admin/announcements"
                  className="admin-dashboard-btn admin-dashboard-btn-secondary"
                >
                  Create or Publish Announcement
                </Link>
              </div>
            ) : (
              <ul className="admin-announcements-preview-list">
                {recentAnnouncements.map((item) => (
                  <li key={String(item.id)} className="admin-announcement-preview-item">
                    <div className="admin-announcement-preview-top">
                      <h3 className="admin-announcement-preview-title">{item.title}</h3>
                      <span className="admin-announcement-category-pill">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                    </div>
                    <p className="admin-announcement-preview-meta">
                      Published {formatShortDate(item.publishedAt)}
                    </p>
                    <p className="admin-announcement-preview-body">
                      {truncateText(item.body, 130)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-dashboard-card" aria-labelledby={quickActionsHeadingId}>
            <div className="admin-card-header">
              <div>
                <h2 id={quickActionsHeadingId}>Quick Actions</h2>
                <p className="admin-card-subtitle">
                  Direct shortcuts to core platform governance modules
                </p>
              </div>
            </div>

            <div className="admin-quick-actions-grid">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.path}
                  to={action.path}
                  className="admin-quick-action-tile"
                >
                  <span className="admin-quick-action-icon">
                    <DashboardIcon name={action.icon} />
                  </span>
                  <div className="admin-quick-action-body">
                    <span className="admin-quick-action-title">{action.label}</span>
                    <span className="admin-quick-action-desc">{action.description}</span>
                  </div>
                  <span className="admin-quick-action-arrow" aria-hidden="true">
                    <DashboardIcon name="arrow-right" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
