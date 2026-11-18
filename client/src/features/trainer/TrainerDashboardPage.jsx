import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { DashboardIcon } from '../admin/AdminLayout.jsx';
import AnnouncementsFeedSection from '../announcements/AnnouncementsFeedSection.jsx';
import { getMyTrainerSkills } from '../competency/competencyApi.js';
import { listCourses } from '../courses/coursesApi.js';
import TrainerLayout from './TrainerLayout.jsx';
import './trainerPortal.css';

const TRAINER_SHORTCUTS = [
  {
    label: 'My Courses',
    description: 'View, filter, and organize your authored training courses.',
    path: '/trainer/courses',
    icon: 'courses',
  },
  {
    label: 'Create New Course',
    description: 'Start a new course draft with structured syllabus metadata.',
    path: '/trainer/courses/new',
    icon: 'plus',
  },
  {
    label: 'My Expertise',
    description: 'Map canonical teaching skills, proficiency, and years of experience.',
    path: '/trainer/skills',
    icon: 'skills',
  },
  {
    label: 'Assessment Builder',
    description: 'Create and publish MCQ quizzes with pass thresholds and time limits.',
    path: '/assessments/manage',
    icon: 'enrollments',
  },
  {
    label: 'Assessment Results',
    description: 'Inspect trainee attempt records, pass rates, and score summaries.',
    path: '/assessments/results',
    icon: 'certificates',
  },
  {
    label: 'My Profile',
    description: 'Update qualifications, subject expertise, organization, and headline.',
    path: '/profile',
    icon: 'users',
  },
];

/**
 * CAPSERA Trainer Dashboard homepage (`/` when authenticated as `ACTIVE` `TRAINER`).
 * Displays real authored-course counts, declared expertise skills, shortcuts to course
 * & assessment management, and published platform announcements.
 */
export default function TrainerDashboardPage() {
  const { user } = useAuth();
  const kpiHeadingId = useId();
  const coursesHeadingId = useId();
  const shortcutsHeadingId = useId();

  const [refreshTick, setRefreshTick] = useState(0);
  const [courses, setCourses] = useState([]);
  const [totalCourses, setTotalCourses] = useState(0);
  const [skills, setSkills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      listCourses({ mine: 'true', page: 1, pageSize: 50 }, { signal: controller.signal }).catch(
        () => ({ items: [], pagination: { totalItems: 0 } }),
      ),
      getMyTrainerSkills({ signal: controller.signal }).catch(() => []),
    ])
      .then(([coursesData, skillsList]) => {
        if (!active) return;
        const safeItems = Array.isArray(coursesData?.items) ? coursesData.items : [];
        const total = Number(
          coursesData?.pagination?.totalItems ?? coursesData?.totalItems ?? safeItems.length,
        );
        setCourses(safeItems);
        setTotalCourses(Number.isFinite(total) ? total : safeItems.length);
        setSkills(Array.isArray(skillsList) ? skillsList : []);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setLoadError(err.message || 'Unable to load trainer workspace summary.');
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshTick]);

  const publishedCount = courses.filter((c) => c.status === 'PUBLISHED').length;
  const draftCount = courses.filter((c) => c.status === 'DRAFT').length;
  const archivedCount = courses.filter((c) => c.status === 'ARCHIVED').length;
  const recentCourses = courses.slice(0, 4);
  const trainerName = user?.fullName || 'Trainer';

  return (
    <TrainerLayout
      title={`Welcome back, ${trainerName}`}
      eyebrow="Trainer Teaching Workspace"
      subtitle="Author courses, build course assessments, review learner outcomes, and maintain your expertise profile."
      headerActions={
        <div className="trainer-header-actions">
          <Link to="/trainer/courses/new" className="admin-dashboard-btn admin-dashboard-btn-secondary">
            + Create Course
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
      {/* Account & Quick Action Banner */}
      <section className="trainer-welcome-banner" aria-label="Trainer account overview">
        <div className="trainer-welcome-copy">
          <div className="trainer-welcome-badges">
            <span className="trainer-role-pill">TRAINER</span>
            {user?.status && <span className="trainer-status-pill">{user.status}</span>}
            {user?.email && <span className="trainer-email-meta">{user.email}</span>}
          </div>
          <p className="trainer-welcome-desc">
            Manage curriculum modules, publish assessments for certificate eligibility, and keep your
            canonical teaching skills current for deterministic trainee matching.
          </p>
        </div>
        <div className="trainer-welcome-ctas">
          <Link to="/trainer/courses" className="admin-dashboard-btn admin-dashboard-btn-primary">
            Manage Courses
          </Link>
          <Link to="/trainer/skills" className="admin-dashboard-btn admin-dashboard-btn-secondary">
            Update Expertise
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

      {/* 1. Real Backend Summary KPI Cards */}
      <section aria-labelledby={kpiHeadingId} className="admin-kpi-section">
        <h2 id={kpiHeadingId} className="admin-sr-only">
          Trainer Summary Metrics
        </h2>
        <div className="admin-kpi-grid">
          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">Authored Courses</span>
              <span className="admin-kpi-icon admin-kpi-icon--blue">
                <DashboardIcon name="courses" />
              </span>
            </div>
            <p className="admin-kpi-value">{totalCourses}</p>
            <p className="admin-kpi-secondary">
              <strong>{publishedCount}</strong> published &middot;{' '}
              <strong>{draftCount}</strong> draft
            </p>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">Published Courses</span>
              <span className="admin-kpi-icon admin-kpi-icon--lime">
                <DashboardIcon name="enrollments" />
              </span>
            </div>
            <p className="admin-kpi-value">{publishedCount}</p>
            <p className="admin-kpi-secondary">Live in catalogue for trainee enrollment</p>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">Draft / Archived</span>
              <span className="admin-kpi-icon admin-kpi-icon--blue">
                <DashboardIcon name="dashboard" />
              </span>
            </div>
            <p className="admin-kpi-value">{draftCount + archivedCount}</p>
            <p className="admin-kpi-secondary">
              <strong>{draftCount}</strong> draft &middot; <strong>{archivedCount}</strong> archived
            </p>
          </article>

          <article className="admin-kpi-card">
            <div className="admin-kpi-top">
              <span className="admin-kpi-label">Declared Expertise</span>
              <span className="admin-kpi-icon admin-kpi-icon--lime">
                <DashboardIcon name="skills" />
              </span>
            </div>
            <p className="admin-kpi-value">{skills.length}</p>
            <p className="admin-kpi-secondary">
              <Link to="/trainer/skills" className="admin-card-action-link">
                Edit expertise mapping &rarr;
              </Link>
            </p>
          </article>
        </div>
      </section>

      {/* 2. Recent Authored Courses + Portal Shortcuts */}
      <div className="admin-overview-grid">
        <section className="admin-dashboard-card" aria-labelledby={coursesHeadingId}>
          <div className="admin-card-header">
            <div>
              <h2 id={coursesHeadingId}>My Authored Courses</h2>
              <p className="admin-card-subtitle">
                Quick access to lessons, assessment builder, and student results
              </p>
            </div>
            <Link to="/trainer/courses" className="admin-card-action-link">
              View All Courses &rarr;
            </Link>
          </div>

          {isLoading ? (
            <p className="admin-dashboard-status" role="status" aria-live="polite">
              Loading your courses...
            </p>
          ) : recentCourses.length === 0 ? (
            <div className="admin-empty-box">
              <p className="admin-dashboard-empty">
                You haven&apos;t created any courses yet. Start authoring your first course draft to
                add lessons and assessments.
              </p>
              <Link
                to="/trainer/courses/new"
                className="admin-dashboard-btn admin-dashboard-btn-primary"
              >
                + Create New Course
              </Link>
            </div>
          ) : (
            <ul className="trainer-course-overview-list">
              {recentCourses.map((course) => {
                const statusClass =
                  course.status === 'PUBLISHED'
                    ? 'trainer-course-pill--published'
                    : course.status === 'DRAFT'
                    ? 'trainer-course-pill--draft'
                    : 'trainer-course-pill--archived';
                return (
                  <li key={String(course.id)} className="trainer-course-overview-item">
                    <div className="trainer-course-overview-top">
                      <div>
                        <h3 className="trainer-course-overview-title">
                          <Link to={`/trainer/courses/${course.id}/edit`}>{course.title}</Link>
                        </h3>
                        <p className="trainer-course-overview-meta">
                          {course.subject || 'General'} &bull; {course.level || 'All Levels'} &bull;{' '}
                          {course.lessonCount ?? 0}{' '}
                          {course.lessonCount === 1 ? 'lesson' : 'lessons'}
                        </p>
                      </div>
                      <span className={`trainer-course-pill ${statusClass}`}>{course.status}</span>
                    </div>

                    <div className="trainer-course-overview-links">
                      <Link
                        to={`/trainer/courses/${course.id}/lessons`}
                        className="admin-card-action-link"
                      >
                        Manage Lessons
                      </Link>
                      <Link
                        to={`/courses/${course.id}/assessments/manage`}
                        className="admin-card-action-link"
                      >
                        Assessments
                      </Link>
                      <Link
                        to={`/courses/${course.id}/assessments/results`}
                        className="admin-card-action-link"
                      >
                        Results
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
              <h2 id={shortcutsHeadingId}>Trainer Shortcuts</h2>
              <p className="admin-card-subtitle">
                Navigate directly to course authoring, assessments, and expertise tools
              </p>
            </div>
          </div>

          <div className="trainer-shortcuts-grid">
            {TRAINER_SHORTCUTS.map((action) => (
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

      {/* 3. Published Homepage Announcements */}
      <div className="trainer-announcements-wrapper">
        <AnnouncementsFeedSection />
      </div>
    </TrainerLayout>
  );
}
