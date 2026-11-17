import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import NotAuthorizedPage from '../auth/NotAuthorizedPage.jsx';

/**
 * Guards a route.
 *  - Not signed in           → redirect to /login (preserves attempted location)
 *  - Signed in, wrong role   → render <NotAuthorizedPage />
 *  - Signed in, role OK      → render children
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string[]} [props.allowedRoles]  - omit to allow any authenticated user
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        <span className="auth-spinner" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <NotAuthorizedPage />;
  }

  return children;
}
