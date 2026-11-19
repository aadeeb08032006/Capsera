import React, { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { CapseraCubeLogo, DashboardIcon, getInitials } from '../admin/AdminLayout.jsx';
import '../admin/adminDashboard.css';
import './trainerPortal.css';

export const TRAINER_NAV_ITEMS = [
  {
    label: 'Dashboard',
    path: '/',
    icon: 'dashboard',
    match: (pathname) => pathname === '/',
  },
  {
    label: 'My Courses',
    path: '/trainer/courses',
    icon: 'courses',
    match: (pathname) =>
      pathname === '/trainer/courses' ||
      (pathname.startsWith('/trainer/courses/') && pathname !== '/trainer/courses/new'),
  },
  {
    label: 'Create Course',
    path: '/trainer/courses/new',
    icon: 'plus',
    match: (pathname) => pathname === '/trainer/courses/new',
  },
  {
    label: 'My Expertise',
    path: '/trainer/skills',
    icon: 'skills',
    match: (pathname) => pathname.startsWith('/trainer/skills'),
  },
  {
    label: 'Assessments',
    path: '/assessments/manage',
    icon: 'enrollments',
    match: (pathname) =>
      pathname.startsWith('/assessments/manage') || pathname.includes('/assessments/manage'),
  },
  {
    label: 'Results',
    path: '/assessments/results',
    icon: 'certificates',
    match: (pathname) =>
      pathname.startsWith('/assessments/results') || pathname.includes('/assessments/results'),
  },
  {
    label: 'My Profile',
    path: '/profile',
    icon: 'users',
    match: (pathname) => pathname.startsWith('/profile'),
  },
];

/**
 * Returns true when the current pathname belongs to the Trainer Portal shell
 * for an authenticated TRAINER user.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isTrainerPortalRoute(pathname) {
  if (typeof pathname !== 'string') return false;
  if (pathname === '/change-password') return true;
  if (pathname === '/courses' || pathname.startsWith('/courses/')) return true;
  return TRAINER_NAV_ITEMS.some((item) => item.match(pathname));
}

/**
 * Shared CAPSERA Trainer Portal layout (`#1B2030` sidebar + workspace header).
 *
 * - For `TRAINER` users, renders the approved V2 sidebar, mobile drawer, header bar,
 *   and workspace container.
 * - For non-trainer users on shared routes (e.g., `ADMIN` on `/trainer/courses`
 *   or `TRAINEE` on `/profile`), passes `children` through unchanged so Admin
 *   and Trainee navigation remain isolated.
 */
export default function TrainerLayout({
  title,
  subtitle,
  eyebrow = 'Instructor Workspace & Course Studio',
  sectionLabel,
  headerActions = null,
  embeddedPage = false,
  children,
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const generatedHeadingId = useId();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  if (user?.role !== 'TRAINER') {
    return <>{children}</>;
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const trainerDisplayName = user?.fullName || 'Trainer';
  const trainerInitials = getInitials(trainerDisplayName);
  const activeNavItem = TRAINER_NAV_ITEMS.find((item) => item.match(location.pathname));
  const resolvedSectionLabel = sectionLabel || activeNavItem?.label || 'Trainer Portal';

  return (
    <div className="admin-layout-shell trainer-layout-shell">
      {sidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        id="trainer-portal-sidebar"
        className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar--open' : ''}`}
        aria-label="Trainer navigation"
      >
        <div className="admin-sidebar-top">
          <div className="admin-brand-row">
            <Link to="/" className="admin-brand-link" aria-label="CAPSERA Home">
              <span className="admin-brand-mark" aria-hidden="true">
                <CapseraCubeLogo />
              </span>
              <span className="admin-brand-wordmark">CAPSERA</span>
            </Link>
            <button
              type="button"
              className="admin-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation menu"
            >
              <DashboardIcon name="close" />
            </button>
          </div>

          <nav className="admin-sidebar-nav" aria-label="Trainer sections">
            <ul className="admin-sidebar-list">
              {TRAINER_NAV_ITEMS.map((item) => {
                const isActive = item.match(location.pathname);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`admin-sidebar-link ${
                        isActive ? 'admin-sidebar-link--active' : ''
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="admin-sidebar-icon">
                        <DashboardIcon name={item.icon} />
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-promo-card">
            <div className="admin-sidebar-promo-top">
              <span className="admin-sidebar-promo-badge">CAPSERA LMS</span>
              <CapseraCubeLogo />
            </div>
            <p className="admin-sidebar-promo-title">Course Catalogue</p>
            <p className="admin-sidebar-promo-copy">
              Preview how trainees discover and enroll in published training tracks.
            </p>
            <Link to="/courses" className="admin-sidebar-promo-cta">
              <span>Browse Catalogue</span>
              <DashboardIcon name="arrow-right" />
            </Link>
          </div>

          <div className="admin-sidebar-account-actions">
            <Link to="/change-password" className="admin-sidebar-sublink">
              Change Password
            </Link>
            {user && (
              <button
                type="button"
                className="admin-sidebar-logout"
                onClick={handleLogout}
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="admin-workspace">
        <header
          className={`admin-dashboard-header ${
            embeddedPage ? 'admin-dashboard-header--compact' : ''
          }`.trim()}
        >
          <div className="admin-header-title-group">
            <button
              type="button"
              className="admin-mobile-menu-btn"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-expanded={sidebarOpen}
              aria-controls="trainer-portal-sidebar"
              aria-label="Toggle trainer navigation"
            >
              <DashboardIcon name="menu" />
            </button>
            {embeddedPage ? (
              <div className="admin-header-breadcrumb">
                <span className="admin-header-eyebrow">{eyebrow}</span>
                <span className="admin-header-section-pill">{resolvedSectionLabel}</span>
              </div>
            ) : (
              <div>
                <span className="admin-header-eyebrow">{eyebrow}</span>
                {title && <h1 id={generatedHeadingId}>{title}</h1>}
                {subtitle && <p className="admin-dashboard-subtitle">{subtitle}</p>}
              </div>
            )}
          </div>

          <div className="admin-header-controls">
            <div className="admin-user-pill" aria-label={`Signed in as ${trainerDisplayName}`}>
              <span className="admin-user-avatar" aria-hidden="true">
                {trainerInitials}
              </span>
              <div className="admin-user-meta">
                <span className="admin-user-name">{trainerDisplayName}</span>
                <span className="admin-user-role">{user?.role || 'TRAINER'}</span>
              </div>
            </div>

            {headerActions}
          </div>
        </header>

        {embeddedPage ? (
          <div className="admin-portal-embedded trainer-portal-embedded">{children}</div>
        ) : (
          <main
            className="admin-dashboard-page trainer-dashboard-page"
            aria-labelledby={title ? generatedHeadingId : undefined}
          >
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
