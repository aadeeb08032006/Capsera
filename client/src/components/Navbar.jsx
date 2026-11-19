import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { CapseraCubeLogo, isAdminPortalRoute } from '../features/admin/AdminLayout.jsx';
import { isTraineePortalRoute } from '../features/trainee/TraineeLayout.jsx';
import { isTrainerPortalRoute } from '../features/trainer/TrainerLayout.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (user?.role === 'ADMIN' && isAdminPortalRoute(location.pathname)) {
    return null;
  }

  if (user?.role === 'TRAINEE' && isTraineePortalRoute(location.pathname)) {
    return null;
  }

  if (user?.role === 'TRAINER' && isTrainerPortalRoute(location.pathname)) {
    return null;
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (!user) {
    return (
      <nav className="navbar" aria-label="Main navigation">
        <div className="navbar-inner">
          <Link to="/" className="navbar-brand">
            <CapseraCubeLogo />
            <span>CAPSERA</span>
          </Link>

          <div className="navbar-links">
            <Link to="/certificates/verify">Verify Certificate</Link>
          </div>

          <div className="navbar-user">
            <Link to="/login" className="navbar-account-link">
              Log in
            </Link>
            <Link to="/signup" className="auth-btn auth-btn--primary auth-btn--sm">
              Sign up
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <CapseraCubeLogo />
          <span>CAPSERA</span>
        </Link>

        <div className="navbar-links">
          <Link to="/courses">Courses</Link>

          {user.role === 'ADMIN' && (
            <>
              <Link to="/admin/dashboard">Admin Dashboard</Link>
              <Link to="/admin/users">Users</Link>
              <Link to="/admin/skills">Skill Catalogue</Link>
              <Link to="/admin/announcements">Announcements</Link>
              <Link to="/trainer/courses">Manage Courses</Link>
              <Link to="/trainers/recommendations">Trainer Recommendations</Link>
            </>
          )}

          {user.role === 'TRAINER' && (
            <>
              <Link to="/trainer/courses">My Courses</Link>
              <Link to="/profile">Profile</Link>
              <Link to="/trainer/skills">My Trainer Skills</Link>
            </>
          )}

          {user.role === 'TRAINEE' && (
            <>
              <Link to="/my-learning">My Learning</Link>
              <Link to="/profile">Profile</Link>
              <Link to="/skills">My Skills</Link>
              <Link to="/trainers/recommendations">Trainer Recommendations</Link>
              <Link to="/certificates">My Certificates</Link>
            </>
          )}
        </div>

        <div className="navbar-user">
          <Link to="/change-password" className="navbar-account-link">Change password</Link>
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
