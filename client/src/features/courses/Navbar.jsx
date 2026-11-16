import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Navbar() {
  const { user, isAuthenticated, isTrainee, isTrainer, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen((prev) => !prev);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="courses-navbar">
      <div className="courses-nav-inner">
        <Link to="/courses" className="courses-nav-brand" onClick={closeMenu}>
          <span className="courses-nav-brand-badge">SIH26075</span>
          <span className="courses-nav-brand-title">CAPSERA</span>
        </Link>

        <button
          type="button"
          className="courses-nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="courses-nav-links"
          aria-label="Toggle navigation menu"
          onClick={toggleMenu}
        >
          <span className="courses-nav-hamburger" aria-hidden="true" />
        </button>

        <nav
          id="courses-nav-links"
          className={`courses-nav-links ${menuOpen ? 'courses-nav-links-open' : ''}`}
          aria-label="Primary navigation"
        >
          <NavLink
            to="/courses"
            className={({ isActive }) =>
              `courses-nav-item ${isActive ? 'courses-nav-item-active' : ''}`
            }
            onClick={closeMenu}
          >
            Course Catalogue
          </NavLink>

          {isTrainee && (
            <NavLink
              to="/my-learning"
              className={({ isActive }) =>
                `courses-nav-item ${isActive ? 'courses-nav-item-active' : ''}`
              }
              onClick={closeMenu}
            >
              My Learning
            </NavLink>
          )}

          {isTrainer && (
            <>
              <NavLink
                to="/trainer/courses"
                className={({ isActive }) =>
                  `courses-nav-item ${isActive ? 'courses-nav-item-active' : ''}`
                }
                onClick={closeMenu}
              >
                My Courses
              </NavLink>
              <NavLink
                to="/trainer/courses/new"
                className={({ isActive }) =>
                  `courses-nav-item ${isActive ? 'courses-nav-item-active' : ''}`
                }
                onClick={closeMenu}
              >
                + New Course
              </NavLink>
            </>
          )}

          <div className="courses-nav-user-section">
            {isAuthenticated ? (
              <div className="courses-nav-user-info">
                <span className="courses-user-badge courses-user-role">
                  {user?.role}
                </span>
                <span className="courses-user-name">
                  {user?.fullName || user?.email}
                </span>
                <button
                  type="button"
                  className="courses-nav-btn courses-nav-btn-logout"
                  onClick={logout}
                  aria-label="Log out of account"
                >
                  Log out
                </button>
              </div>
            ) : (
              <span className="courses-user-badge courses-user-guest">
                Guest View
              </span>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
