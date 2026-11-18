import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { CapseraCubeLogo } from '../admin/AdminLayout.jsx';

export default function NotAuthorizedPage() {
  const { user } = useAuth();

  return (
    <main className="auth-centered-page">
      <div className="auth-card auth-card--wide">
        <div className="auth-brand-header">
          <span className="auth-brand-mark" aria-hidden="true">
            <CapseraCubeLogo />
          </span>
          <span className="auth-brand-name">CAPSERA LMS</span>
        </div>
        <h1 className="auth-card__title">Access Denied</h1>
        <p className="auth-card__subtitle">
          {user
            ? `Your account role (${user.role}) does not have permission to view this page.`
            : 'You do not have permission to view this page.'}
        </p>
        <div className="auth-card__actions">
          <Link to="/" className="auth-btn auth-btn--primary">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
