import { useState } from 'react';
import { apiRequest } from '../../services/apiClient.js';

function validateNewPassword(password) {
  const byteLength = new TextEncoder().encode(password).length;
  if (byteLength < 8 || byteLength > 72) return 'Use 8 to 72 UTF-8 bytes.';
  if (!/\p{L}/u.test(password)) return 'Include at least one letter.';
  if (!/[0-9]/.test(password)) return 'Include at least one number.';
  return '';
}

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const policyError = validateNewPassword(newPassword);
    if (policyError) {
      setError(policyError);
      setSuccess('');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must differ from your current password.');
      setSuccess('');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      setSuccess('');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Your password has been changed.');
    } catch (requestError) {
      setError(requestError.message || 'Could not change your password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-centered-page">
      <section className="auth-card" aria-labelledby="change-password-title">
        <span className="auth-section-pill">Account Security</span>
        <h1 id="change-password-title" className="auth-card__title">Change password</h1>
        <p className="auth-card__subtitle">Enter your current password and choose a new one.</p>

        {error && <p className="auth-alert" role="alert">{error}</p>}
        {success && <p className="page-success" role="status">{success}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="current-password">Current password</label>
            <input
              className="auth-input"
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="new-password">New password</label>
            <input
              className="auth-input"
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={isSubmitting}
              aria-describedby="new-password-policy"
              required
            />
            <span className="auth-field-hint" id="new-password-policy">
              8–72 UTF-8 bytes, with at least one letter and one number.
            </span>
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="confirm-password">Confirm new password</label>
            <input
              className="auth-input"
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>
          <button type="submit" className="auth-btn auth-btn--primary auth-btn--full" disabled={isSubmitting}>
            {isSubmitting ? 'Changing password…' : 'Change password'}
          </button>
        </form>
      </section>
    </main>
  );
}