import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { CapseraCubeLogo } from '../admin/AdminLayout.jsx';
import UiIcon from '../../components/UiIcon.jsx';

const PASSWORD_REGEX_LETTER = /[a-zA-Z]/;
const PASSWORD_REGEX_NUMBER = /[0-9]/;

function validatePassword(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be at most 72 characters.';
  if (!PASSWORD_REGEX_LETTER.test(pw)) return 'Password must contain at least one letter.';
  if (!PASSWORD_REGEX_NUMBER.test(pw)) return 'Password must contain at least one number.';
  return null;
}

export default function SignupPage() {
  const { signup } = useAuth();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'TRAINEE',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    setServerError('');
  }

  function validate() {
    const errors = {};
    if (!form.fullName.trim()) errors.fullName = 'Full name is required.';
    if (form.fullName.trim().length > 150) errors.fullName = 'Full name must be at most 150 characters.';
    if (!form.email.trim()) errors.email = 'Email is required.';
    const pwErr = validatePassword(form.password);
    if (pwErr) errors.password = pwErr;
    if (!form.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (!['TRAINEE', 'TRAINER'].includes(form.role)) errors.role = 'Please select a valid role.';
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setServerError('');

    try {
      await signup({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });

      // Clear password from state immediately after submission
      setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      setSuccess(true);
    } catch (err) {
      const code = err.code || '';
      if (code === 'EMAIL_ALREADY_REGISTERED') {
        setFieldErrors({ email: 'An account with this email already exists.' });
      } else if (code === 'VALIDATION_ERROR') {
        setServerError(err.message || 'Please check your inputs and try again.');
      } else if (code === 'RATE_LIMITED' || err.status === 429) {
        setServerError('Too many signup attempts. Please wait a moment and try again.');
      } else {
        setServerError(err.message || 'Signup failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="auth-centered-page">
        <div className="auth-card">
          <div className="auth-success-icon" aria-hidden="true">
            <UiIcon name="check-circle" size={40} />
          </div>
          <h1 className="auth-card__title">Account Created!</h1>
          <div className="auth-pending-notice" role="status">
            <strong>Your account is pending admin approval.</strong>
            <p>
              An administrator will review your registration and activate your account.
              You will be able to log in once your account is approved.
            </p>
          </div>
          <div className="auth-card__actions">
            <Link to="/login" className="auth-btn auth-btn--primary">
              Go to Login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-centered-page">
      <div className="auth-card">
        <div className="auth-brand-header">
          <span className="auth-brand-mark" aria-hidden="true">
            <CapseraCubeLogo />
          </span>
          <span className="auth-brand-name">CAPSERA LMS</span>
        </div>
        <h1 className="auth-card__title">Create Account</h1>
        <p className="auth-card__subtitle">Register as a Trainee or Trainer to join CAPSERA</p>

        {serverError && (
          <div className="auth-alert" role="alert">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="fullName" className="auth-label">
              Full Name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              className={`auth-input${fieldErrors.fullName ? ' auth-input--error' : ''}`}
              value={form.fullName}
              onChange={handleChange}
              autoComplete="name"
              disabled={submitting}
              aria-describedby={fieldErrors.fullName ? 'fullName-error' : undefined}
              aria-invalid={!!fieldErrors.fullName}
              maxLength={150}
            />
            {fieldErrors.fullName && (
              <span id="fullName-error" className="auth-field-error" role="alert">
                {fieldErrors.fullName}
              </span>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="email" className="auth-label">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className={`auth-input${fieldErrors.email ? ' auth-input--error' : ''}`}
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              disabled={submitting}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              aria-invalid={!!fieldErrors.email}
              maxLength={255}
            />
            {fieldErrors.email && (
              <span id="email-error" className="auth-field-error" role="alert">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="password" className="auth-label">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className={`auth-input${fieldErrors.password ? ' auth-input--error' : ''}`}
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              disabled={submitting}
              aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
              aria-invalid={!!fieldErrors.password}
              maxLength={72}
            />
            {fieldErrors.password ? (
              <span id="password-error" className="auth-field-error" role="alert">
                {fieldErrors.password}
              </span>
            ) : (
              <span id="password-hint" className="auth-field-hint">
                At least 8 characters with a letter and a number.
              </span>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword" className="auth-label">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className={`auth-input${fieldErrors.confirmPassword ? ' auth-input--error' : ''}`}
              value={form.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              disabled={submitting}
              aria-describedby={fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined}
              aria-invalid={!!fieldErrors.confirmPassword}
              maxLength={72}
            />
            {fieldErrors.confirmPassword && (
              <span id="confirmPassword-error" className="auth-field-error" role="alert">
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="role" className="auth-label">
              I am a…
            </label>
            <select
              id="role"
              name="role"
              className={`auth-input auth-select${fieldErrors.role ? ' auth-input--error' : ''}`}
              value={form.role}
              onChange={handleChange}
              disabled={submitting}
              aria-describedby={fieldErrors.role ? 'role-error' : undefined}
              aria-invalid={!!fieldErrors.role}
            >
              <option value="TRAINEE">Trainee</option>
              <option value="TRAINER">Trainer</option>
            </select>
            {fieldErrors.role && (
              <span id="role-error" className="auth-field-error" role="alert">
                {fieldErrors.role}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="auth-btn auth-btn--primary auth-btn--full"
            disabled={submitting}
          >
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="auth-card__footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
