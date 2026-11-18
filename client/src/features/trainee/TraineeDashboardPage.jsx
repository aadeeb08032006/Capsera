import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { DashboardIcon } from '../admin/AdminLayout.jsx';
import AnnouncementsFeedSection from '../announcements/AnnouncementsFeedSection.jsx';
import { listMyCertificates } from '../certificates/certificatesApi.js';
import { getMyTraineeSkills } from '../competency/competencyApi.js';
import { getMyEnrollments } from '../courses/coursesApi.js';
import TraineeLayout from './TraineeLayout.jsx';
import './traineePortal.css';

const TRAINEE_SHORTCUTS = [
  {
    label: 'My Learning',
    description: 'Resume enrolled courses, track lesson progress, and complete assessments.',
    path: '/my-learning',
    icon: 'enrollments',
  },
  {
    label: 'Explore Courses',
    description: 'Browse the published course catalogue by topic, subject, and skill level.',
    path: '/courses',
    icon: 'courses',
  },
  {
    label: 'Manage Skills',
    description: 'Map canonical skills and declare your current proficiency levels (1–4).',
    path: '/skills',
    icon: 'skills',
  },
  {
    label: 'Find Trainers',
    description: 'Discover active trainers matched deterministically by canonical skill.',
    path: '/trainers/recommendations',
    icon: 'recommendations',
  },
  {
    label: 'My Certificates',
    description: 'View earned completion certificates and open public verification records.',
    path: '/certificates',
    icon: 'certificates',
  },
  {
    label: 'My Profile',
    description: 'Update your headline, organization, qualifications, and learning interests.',
    path: '/profile',
    icon: 'users',
  },
];

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

/**
 * CAPSERA Trainee Dashboard homepage (`/` when authenticated as `ACTIVE` `TRAINEE`).
 * Aggregates real data from `getMyEnrollments()`, `getMyTraineeSkills()`,
 * `listMyCertificates()`, and `<AnnouncementsFeedSection />`.
 */
export default function TraineeDashboardPage() {
  const { user } = useAuth();
  const kpiHeadingId = useId();
  const learningHeadingId = useId();
  const shortcutsHeadingId = useId();

  const [refreshTick, setRefreshTick] = useState(0);
  const [enrollments, setEnrollments] = useState([]);
  const [skills, setSkills] = useState([]);
  const [certificatesTotal, setCertificatesTotal] = useState(0);
  const [validCertificatesCount, setValidCertificatesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      getMyEnrollments({ signal: controller.signal }).catch(() => []),
      getMyTraineeSkills({ signal: controller.signal }).catch(() => []),
      listMyCertificates({ page: 1, pageSize: 10 }, { signal: controller.signal }).catch(() => ({
        items: [],
        pagination: { totalItems: 0 },
      })),
    ])
      .then(([enrollmentsList, skillsList, certsData]) => {
        if (!active) return;
        const safeEnrollments = Array.isArray(enrollmentsList) ? enrollmentsList : [];
        const safeSkills = Array.isArray(skillsList) ? skillsList : [];
        const certItems = Array.isArray(certsData?.items) ? certsData.items : [];
        const certTotal = Number(certsData?.pagination?.totalItems ?? certItems.length) || 0;
        const validCount = certItems.filter((item) => item.isValid !== false).length;

        setEnrollments(safeEnrollments);
        setSkills(safeSkills);
        setCertificatesTotal(certTotal);
        setValidCertificatesCount(validCount);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setLoadError(err.message || 'Unable to load trainee workspace summary.');
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshTick]);

  const totalEnrolled = enrollments.length;
  const completedCount = enrollments.filter(
    (item) => item.status === 'COMPLETED' || Number(item.progressPercentage) === 100,
  ).length;
  const activeCount = enrollments.filter(
    (item) => item.status === 'ACTIVE' && Number(item.progressPercentage) < 100,
  ).length;
  const recentEnrollments = enrollments.slice(0, 3);

  const traineeName = user?.fullName || 'Learner';

  return (
    <TraineeLayout
      title={`Welcome back, ${traineeName}`}
      eyebrow="Trainee Learning Workspace"
      subtitle="Track your enrolled courses, maintain your competency profile, and explore training opportunities."
      headerActions={
        <div className="trainee-header-actions">
          <Link to="/courses" className="admin-dashboard-btn admin-dashboard-btn-secondary">
            Explore Courses
          </Link>
          <button
            type="button"
            className="admin-dashboard-btn admin-dashboard-btn-primary"
            onClick={() => setRefreshTick((tick) => tick + 1)}
            disabled={isLoading}
          >
            <DashboardIcon name="refresh" />
            <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      }
    >
      {/* Personalized Account & Quick CTA Banner */}
      <section className="trainee-welcome-banner" aria-label="Account overview">
        <div className="trainee-welcome-copy">
          <div className="trainee-welcome-badges">
            <span className="trainee-role-pill">TRAINEE</span>
            {user?.status && (
              <span className="trainee-status-pill">{user.status}</span>
            )}
            {user?.email && (
              <span className="trainee-email-meta">{user.email}</span>
            )}
          </div>
          <p className="trainee-welcome-desc">
            Build verifiable competencies by completing structured course modules, passing required
            assessments, and keeping your canonical skill profile up to date.
          </p>
        </div>
        <div className="trainee-welcome-ctas">
          <Link to="/my-learning" className="admin-dashboard-btn admin-dashboard-btn-primary">
            Go to My Learning
          </Link>
          <Link to="/skills" className="admin-dashboard-btn admin-dashboard-btn-secondary">
            Manage Skills
          </Link>
        </div>
      </section>

      {loadError && (
        <section className="admin-dashboard-card">
          <div className="admin-dashboard-banner-error" role="alert">
            <p className="admin-dashboard-error-text">{loadError}</p>
            <button
              type="button"
              className="admin-dashboard-btn admin-dashboard-btn-secondary"
              onClick={() => setRefreshTick((tick) => tick + 1)}
            >
              Retry
            </button>
          </div>
        </section>
      )}

      {/* 1. Real API Summary KPI Cards */}
      <section aria-labelledby={kpiHeadingId} className="admin-kpi-section">
        <h2 id={kpiHeadingId} className="admin-sr-only">
          Learning Summary Metrics
        </h2>
        <div className="admin-kpi-grid">
          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">Enrolled Courses</span>
              <span className="admin-kpi-icon admin-kpi-icon--blue">
                <DashboardIcon name="enrollments" />
              </span>
            </div>
            <p className="admin-kpi-value">{totalEnrolled}</p>
            <p className="admin-kpi-secondary">
              <strong>{activeCount}</strong> in progress &middot;{' '}
              <strong>{completedCount}</strong> completed
            </p>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">Completed Courses</span>
              <span className="admin-kpi-icon admin-kpi-icon--lime">
                <DashboardIcon name="courses" />
              </span>
            </div>
            <p className="admin-kpi-value">{completedCount}</p>
            <p className="admin-kpi-secondary">
              {totalEnrolled > 0 ? (
                <>
                  <strong>{Math.round((completedCount / totalEnrolled) * 100)}%</strong> of your
                  enrollments
                </>
              ) : (
                'Enroll in a course to begin'
              )}
            </p>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">Mapped Skills</span>
              <span className="admin-kpi-icon admin-kpi-icon--blue">
                <DashboardIcon name="skills" />
              </span>
            </div>
            <p className="admin-kpi-value">{skills.length}</p>
            <p className="admin-kpi-secondary">
              <Link to="/skills" className="admin-card-action-link">
                Update proficiency levels &rarr;
              </Link>
            </p>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">Certificates Earned</span>
              <span className="admin-kpi-icon admin-kpi-icon--lime">
                <DashboardIcon name="certificates" />
              </span>
            </div>
            <p className="admin-kpi-value">{certificatesTotal}</p>
            <p className="admin-kpi-secondary">
              <strong>{validCertificatesCount}</strong> valid credentials
            </p>
          </article>
        </div>
      </section>

      {/* 2. Active Learning Progress + Quick Shortcuts */}
      <div className="admin-overview-grid">
        <section className="admin-dashboard-card" aria-labelledby={learningHeadingId}>
          <div className="admin-card-header">
            <div>
              <h2 id={learningHeadingId}>My Learning Progress</h2>
              <p className="admin-card-subtitle">
                Recent course enrollments and lesson completion status
              </p>
            </div>
            <Link to="/my-learning" className="admin-card-action-link">
              View All Enrollments &rarr;
            </Link>
          </div>

          {isLoading ? (
            <p className="admin-dashboard-status" role="status" aria-live="polite">
              Loading your enrolled courses...
            </p>
          ) : recentEnrollments.length === 0 ? (
            <div className="admin-empty-box">
              <p className="admin-dashboard-empty">
                You are not enrolled in any courses yet. Browse the published course catalogue to
                start learning.
              </p>
              <Link to="/courses" className="admin-dashboard-btn admin-dashboard-btn-primary">
                Explore Courses
              </Link>
            </div>
          ) : (
            <ul className="trainee-enrollment-list">
              {recentEnrollments.map((item) => {
                const courseTitle =
                  item.courseTitle || item.course?.title || `Course #${item.courseId}`;
                const subject = item.course?.subject || item.subject || null;
                const progress = clampPercent(item.progressPercentage);
                const isComplete = item.status === 'COMPLETED' || progress === 100;

                return (
                  <li key={String(item.id)} className="trainee-enrollment-item">
                    <div className="trainee-enrollment-top">
                      <div>
                        <h3 className="trainee-enrollment-title">
                          <Link to={`/courses/${item.courseId}`}>{courseTitle}</Link>
                        </h3>
                        <p className="trainee-enrollment-meta">
                          {subject ? `${subject} • ` : ''}
                          {item.completedLessons ?? 0} of {item.totalLessons ?? 0} lessons completed
                        </p>
                      </div>
                      <span
                        className={`trainee-enrollment-badge ${
                          isComplete
                            ? 'trainee-enrollment-badge--completed'
                            : 'trainee-enrollment-badge--active'
                        }`}
                      >
                        {isComplete ? 'COMPLETED' : `${progress}%`}
                      </span>
                    </div>

                    <div
                      className="admin-progress-track"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress for ${courseTitle}`}
                    >
                      <div
                        className="admin-progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <div className="trainee-enrollment-actions">
                      <Link
                        to={`/courses/${item.courseId}`}
                        className="admin-card-action-link"
                      >
                        {isComplete ? 'Review Course Material' : 'Continue Learning'} &rarr;
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="admin-dashboard-card" aria-labelledby={shortcutsHeadingId}>
          <div className="admin-card-header">
            <div>
              <h2 id={shortcutsHeadingId}>Portal Shortcuts</h2>
              <p className="admin-card-subtitle">
                Direct access to courses, skills, trainer discovery, and certificates
              </p>
            </div>
          </div>

          <div className="trainee-shortcuts-grid">
            {TRAINEE_SHORTCUTS.map((action) => (
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

      {/* 3. Published Homepage Announcements Feed */}
      <div className="trainee-announcements-wrapper">
        <AnnouncementsFeedSection />
      </div>
    </TraineeLayout>
  );
}
