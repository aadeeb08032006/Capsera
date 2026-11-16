import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (!user) return null;

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          CAPSERA
        </Link>

        <div className="navbar-user">
          <span className="navbar-user-name" aria-label={`Signed in as ${user.fullName}`}>
            {user.fullName}
          </span>
          <span className="navbar-role-badge">{user.role}</span>
          <button
            type="button"
            className="auth-btn auth-btn--outline auth-btn--sm"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
