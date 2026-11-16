import React from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

const ROLE_LABELS = {
  TRAINEE: 'Trainee',
  TRAINER: 'Trainer',
  ADMIN: 'Administrator',
};

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <main className="dashboard-container">
      <div className="dashboard-welcome">
        <h1 className="dashboard-title">
          Welcome back, <span className="dashboard-name">{user?.fullName}</span>!
        </h1>
        <span className="dashboard-role-badge">
          {ROLE_LABELS[user?.role] ?? user?.role}
        </span>
      </div>

      <div className="dashboard-card">
        <h2>Your Account</h2>
        <dl className="dashboard-details">
          <div className="dashboard-detail-row">
            <dt>Full Name</dt>
            <dd>{user?.fullName}</dd>
          </div>
          <div className="dashboard-detail-row">
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div className="dashboard-detail-row">
            <dt>Role</dt>
            <dd>{ROLE_LABELS[user?.role] ?? user?.role}</dd>
          </div>
          <div className="dashboard-detail-row">
            <dt>Status</dt>
            <dd>
              <span className={`dashboard-status dashboard-status--${user?.status?.toLowerCase()}`}>
                {user?.status}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="dashboard-card dashboard-card--muted">
        <p>
          Module-specific content will appear here once feature modules are built.
        </p>
      </div>
    </main>
  );
}
