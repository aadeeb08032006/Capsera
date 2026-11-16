import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Incorrect email or password. Please try again.',
  ACCOUNT_PENDING:
    'Your account is awaiting admin approval. You will be notified once approved.',
  ACCOUNT_REJECTED:
    'Your account registration was not approved. Please contact support.',
  ACCOUNT_SUSPENDED:
    'Your account has been suspended. Please contact support for assistance.',
  RATE_LIMITED:
    'Too many login attempts. Please wait a moment before trying again.',
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [form, setForm] = useState({ email: '', password: '' });
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setServerError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.email.trim()) {
      setServerError('Email is required.');
      return;
    }
    if (!form.password) {
      setServerError('Password is required.');
      return;
    }

    setSubmitting(true);
    setServerError('');

    try {
      await login(form.email, form.password);
      // Clear password from local state once login succeeds
      setForm((prev) => ({ ...prev, password: '' }));
      navigate(from, { replace: true });
    } catch (err) {
      setForm((prev) => ({ ...prev, password: '' }));
      const code = err.code || '';
      setServerError(
        ERROR_MESSAGES[code] ||
          err.message ||
          'Login failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-centered-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Sign In</h1>
        <p className="auth-card__subtitle">Welcome back to CAPSERA</p>

        {serverError && (
          <div className="auth-alert" role="alert">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="email" className="auth-label">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="auth-input"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              disabled={submitting}
              aria-invalid={!!serverError}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password" className="auth-label">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="auth-input"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
              disabled={submitting}
              aria-invalid={!!serverError}
            />
          </div>

          <button
            type="submit"
            className="auth-btn auth-btn--primary auth-btn--full"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="auth-card__footer">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="auth-link">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
