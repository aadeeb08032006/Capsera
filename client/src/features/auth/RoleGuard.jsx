import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

/**
 * Temporary Member 1 Role Guard Stub
 * Enforces server-aligned role restrictions on routes (PRD Section 11.1).
 *
 * @param {{ allowedRoles: string[], children: React.ReactNode }} props
 */
export default function RoleGuard({ allowedRoles = [], children }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="courses-loading-container" role="status" aria-live="polite">
        <div className="courses-spinner" aria-hidden="true" />
        <p>Verifying permissions...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="courses-page-container">
        <div className="courses-state-card courses-state-warning" role="alert">
          <h2>Authentication Required</h2>
          <p>Please log in to your CAPSERA account to access this page.</p>
          <a href="/courses" className="courses-btn courses-btn-primary">
            Explore Course Catalogue
          </a>
        </div>
      </main>
    );
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <main className="courses-page-container">
        <div className="courses-state-card courses-state-error" role="alert">
          <h2>Access Restricted</h2>
          <p>
            This area requires a <strong>{allowedRoles.join(' or ')}</strong> role. Your current role is <strong>{user.role}</strong>.
          </p>
          <a href="/courses" className="courses-btn courses-btn-secondary">
            Return to Catalogue
          </a>
        </div>
      </main>
    );
  }

  return children;
}
