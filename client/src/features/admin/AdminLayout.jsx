import React, { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import './adminDashboard.css';

export const ADMIN_NAV_ITEMS = [
  {
    label: 'Dashboard',
    path: '/admin/dashboard',
    icon: 'dashboard',
    match: (pathname) => pathname === '/admin/dashboard',
  },
  {
    label: 'User Management',
    path: '/admin/users',
    icon: 'users',
    match: (pathname) => pathname.startsWith('/admin/users'),
  },
  {
    label: 'Courses',
    path: '/trainer/courses',
    icon: 'courses',
    match: (pathname) => pathname.startsWith('/trainer/courses'),
  },
  {
    label: 'Skill Catalogue',
    path: '/admin/skills',
    icon: 'skills',
    match: (pathname) => pathname.startsWith('/admin/skills'),
  },
  {
    label: 'Trainer Recommendations',
    path: '/trainers/recommendations',
    icon: 'recommendations',
    match: (pathname) => pathname.startsWith('/trainers/recommendations'),
  },
  {
    label: 'Announcements',
    path: '/admin/announcements',
    icon: 'announcements',
    match: (pathname) => pathname.startsWith('/admin/announcements'),
  },
];

/**
 * Returns true when the current pathname belongs to the Admin Portal shell
 * for an authenticated ADMIN user.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isAdminPortalRoute(pathname) {
  if (typeof pathname !== 'string') return false;
  if (pathname === '/change-password') return true;
  if (pathname === '/courses' || pathname.startsWith('/courses/')) return true;
  if (pathname.includes('/assessments/manage') || pathname.includes('/assessments/results')) {
    return true;
  }
  return ADMIN_NAV_ITEMS.some((item) => item.match(pathname));
}

export function getInitials(fullName) {
  const raw = typeof fullName === 'string' ? fullName.trim() : '';
  if (!raw) return 'AD';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function CapseraCubeLogo() {
  return (
    <svg
      viewBox="0 0 28 28"
      width="24"
      height="24"
      fill="none"
      aria-hidden="true"
      className="admin-cube-svg"
    >
      <path d="M14 2.5L24.5 8.5L14 14.5L3.5 8.5L14 2.5Z" fill="#CBF36B" />
      <path d="M3.5 8.5L14 14.5V25.5L3.5 19.5V8.5Z" fill="#365CF5" />
      <path d="M24.5 8.5L14 14.5V25.5L24.5 19.5V8.5Z" fill="#9EC928" />
      <path
        d="M14 6.2L19.8 9.5L14 12.8L8.2 9.5L14 6.2Z"
        fill="#1B2030"
        fillOpacity="0.22"
      />
    </svg>
  );
}

export function DashboardIcon({ name }) {
  switch (name) {
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'courses':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case 'skills':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'recommendations':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      );
    case 'announcements':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11l18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      );
    case 'enrollments':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'certificates':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="6" />
          <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
        </svg>
      );
    case 'refresh':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      );
    case 'menu':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      );
    case 'close':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Shared CAPSERA Admin Portal layout (`#1B2030` sidebar + workspace header).
 *
 * - For `ADMIN` users, renders the approved V2 sidebar, mobile drawer, header bar,
 *   and workspace container.
 * - For non-admin users on shared routes (e.g., `TRAINER` on `/trainer/courses`
 *   or `TRAINEE` on `/trainers/recommendations`), passes `children` through unchanged
 *   so existing Trainer/Trainee navigation is preserved.
 */
export default function AdminLayout({
  title,
  subtitle,
  eyebrow = 'Capacity Building & Learning Governance',
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

  if (user?.role !== 'ADMIN') {
    return <>{children}</>;
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const adminDisplayName = user?.fullName || 'Administrator';
  const adminInitials = getInitials(adminDisplayName);
  const activeNavItem = ADMIN_NAV_ITEMS.find((item) => item.match(location.pathname));
  const resolvedSectionLabel = sectionLabel || activeNavItem?.label || 'Admin Portal';

  return (
    <div className="admin-layout-shell">
      {sidebarOpen && (
        <div
          className="admin-sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        id="admin-dashboard-sidebar"
        className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar--open' : ''}`}
        aria-label="Administrator navigation"
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

          <nav className="admin-sidebar-nav" aria-label="Admin sections">
            <ul className="admin-sidebar-list">
              {ADMIN_NAV_ITEMS.map((item) => {
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
            <p className="admin-sidebar-promo-title">Capacity Building Hub</p>
            <p className="admin-sidebar-promo-copy">
              Explore published training programs and competency pathways.
            </p>
            <Link to="/courses" className="admin-sidebar-promo-cta">
              <span>Course Catalogue</span>
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
              aria-controls="admin-dashboard-sidebar"
              aria-label="Toggle administrator navigation"
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
            <div className="admin-user-pill" aria-label={`Signed in as ${adminDisplayName}`}>
              <span className="admin-user-avatar" aria-hidden="true">
                {adminInitials}
              </span>
              <div className="admin-user-meta">
                <span className="admin-user-name">{adminDisplayName}</span>
                <span className="admin-user-role">{user?.role || 'ADMIN'}</span>
              </div>
            </div>

            {headerActions}
          </div>
        </header>

        {embeddedPage ? (
          <div className="admin-portal-embedded">{children}</div>
        ) : (
          <main
            className="admin-dashboard-page"
            aria-labelledby={title ? generatedHeadingId : undefined}
          >
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
