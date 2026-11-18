import React, { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { CapseraCubeLogo, DashboardIcon, getInitials } from '../admin/AdminLayout.jsx';
import '../admin/adminDashboard.css';
import './traineePortal.css';

export const TRAINEE_NAV_ITEMS = [
  {
    label: 'Dashboard',
    path: '/',
    icon: 'dashboard',
    match: (pathname) => pathname === '/',
  },
  {
    label: 'Course Catalogue',
    path: '/courses',
    icon: 'courses',
    match: (pathname) =>
      pathname === '/courses' ||
      (pathname.startsWith('/courses/') &&
        !pathname.includes('/assessments/manage') &&
        !pathname.includes('/assessments/results')),
  },
  {
    label: 'My Learning',
    path: '/my-learning',
    icon: 'enrollments',
    match: (pathname) => pathname.startsWith('/my-learning'),
  },
  {
    label: 'My Skills',
    path: '/skills',
    icon: 'skills',
    match: (pathname) => pathname.startsWith('/skills'),
  },
  {
    label: 'Find Trainers',
    path: '/trainers/recommendations',
    icon: 'recommendations',
    match: (pathname) => pathname.startsWith('/trainers/recommendations'),
  },
  {
    label: 'My Certificates',
    path: '/certificates',
    icon: 'certificates',
    match: (pathname) => pathname === '/certificates',
  },
  {
    label: 'My Profile',
    path: '/profile',
    icon: 'users',
    match: (pathname) => pathname.startsWith('/profile'),
  },
];

/**
 * Returns true when the current pathname belongs to the Trainee Portal shell
 * for an authenticated TRAINEE user.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isTraineePortalRoute(pathname) {
  if (typeof pathname !== 'string') return false;
  if (pathname === '/change-password') return true;
  if (pathname.startsWith('/assessments/') && pathname.endsWith('/player')) return true;
  if (pathname.startsWith('/feedback/')) return true;
  return TRAINEE_NAV_ITEMS.some((item) => item.match(pathname));
}

/**
 * Shared CAPSERA Trainee Portal layout (`#1B2030` sidebar + workspace header).
 *
 * - For `TRAINEE` users, renders the approved V2 sidebar, mobile drawer, header bar,
 *   and workspace container.
 * - For non-trainee users on shared routes (e.g., `ADMIN` on `/trainers/recommendations`,
 *   `TRAINER` on `/profile`, or unauthenticated users on `/courses`), passes `children`
 *   through unchanged so Admin, Trainer, and public navigation are preserved.
 */
export default function TraineeLayout({
  title,
  subtitle,
  eyebrow = 'Learner Workspace & Competency Portal',
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

  if (user?.role !== 'TRAINEE') {
    return <>{children}</>;
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const traineeDisplayName = user?.fullName || 'Trainee';
  const traineeInitials = getInitials(traineeDisplayName);
  const activeNavItem = TRAINEE_NAV_ITEMS.find((item) => item.match(location.pathname));
  const resolvedSectionLabel = sectionLabel || activeNavItem?.label || 'Trainee Portal';

  return (
    <div className="admin-layout-shell trainee-layout-shell">
      {sidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        id="trainee-portal-sidebar"
        className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar--open' : ''}`}
        aria-label="Trainee navigation"
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

          <nav className="admin-sidebar-nav" aria-label="Trainee sections">
            <ul className="admin-sidebar-list">
              {TRAINEE_NAV_ITEMS.map((item) => {
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
            <p className="admin-sidebar-promo-title">Credential Verification</p>
            <p className="admin-sidebar-promo-copy">
              Complete lessons and required assessments to earn verifiable certificates.
            </p>
            <Link to="/certificates/verify" className="admin-sidebar-promo-cta">
              <span>Verify Certificate</span>
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
              aria-controls="trainee-portal-sidebar"
              aria-label="Toggle trainee navigation"
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
            <div className="admin-user-pill" aria-label={`Signed in as ${traineeDisplayName}`}>
              <span className="admin-user-avatar" aria-hidden="true">
                {traineeInitials}
              </span>
              <div className="admin-user-meta">
                <span className="admin-user-name">{traineeDisplayName}</span>
                <span className="admin-user-role">{user?.role || 'TRAINEE'}</span>
              </div>
            </div>

            {headerActions}
          </div>
        </header>

        {embeddedPage ? (
          <div className="admin-portal-embedded trainee-portal-embedded">{children}</div>
        ) : (
          <main
            className="admin-dashboard-page trainee-dashboard-page"
            aria-labelledby={title ? generatedHeadingId : undefined}
          >
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
