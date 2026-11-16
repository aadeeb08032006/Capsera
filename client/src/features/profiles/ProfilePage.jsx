import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiRequest } from '../../services/apiClient.js';

const TRAINEE_FIELDS = [
  ['headline', 'Headline'],
  ['organization', 'Organization'],
  ['biography', 'Biography'],
  ['qualifications', 'Qualifications'],
  ['workExperience', 'Work experience'],
  ['interests', 'Interests'],
  ['externalCertifications', 'External certifications'],
];

const TRAINER_FIELDS = [
  ['headline', 'Headline'],
  ['organization', 'Organization'],
  ['biography', 'Biography'],
  ['qualifications', 'Qualifications'],
  ['workExperience', 'Work experience'],
  ['subjectExpertise', 'Subject expertise'],
];

function makeFormValues(profile, role) {
  const fields = role === 'TRAINER' ? TRAINER_FIELDS : TRAINEE_FIELDS;
  return {
    ...Object.fromEntries(fields.map(([key]) => [key, profile?.[key] ?? ''])),
    ...(role === 'TRAINER'
      ? { yearsOfExperience: String(profile?.yearsOfExperience ?? 0) }
      : {}),
  };
}

function getFieldLimit(key) {
  if (key === 'headline' || key === 'organization') return 200;
  if (key === 'subjectExpertise') return 255;
  return undefined;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [values, setValues] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  const role = user?.role;
  const fields = role === 'TRAINER' ? TRAINER_FIELDS : TRAINEE_FIELDS;

  useEffect(() => {
    let active = true;
    apiRequest('/profiles/me', { method: 'GET' })
      .then((payload) => {
        if (active) setValues(makeFormValues(payload.data?.profile, role));
      })
      .catch((error) => {
        if (active) setLoadError(error.message || 'Could not load your profile.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role]);

  function updateValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: '' }));
    setServerError('');
    setSuccessMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    for (const [key] of fields) {
      const limit = getFieldLimit(key);
      if (limit && values[key].length > limit) {
        nextErrors[key] = `Must be ${limit} characters or fewer.`;
      }
    }

    let yearsOfExperience;
    if (role === 'TRAINER') {
      const rawYears = values.yearsOfExperience.trim();
      yearsOfExperience = Number(rawYears);
      if (
        !rawYears ||
        !Number.isFinite(yearsOfExperience) ||
        yearsOfExperience < 0 ||
        yearsOfExperience > 80 ||
        !/^\d{1,2}(\.\d)?$/.test(rawYears)
      ) {
        nextErrors.yearsOfExperience = 'Enter a number from 0 to 80 with at most one decimal place.';
      }
    }

    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setServerError('Please correct the highlighted fields.');
      setSuccessMessage('');
      return;
    }

    const body = Object.fromEntries(
      fields.map(([key]) => [key, values[key].trim() || null]),
    );
    if (role === 'TRAINER') body.yearsOfExperience = yearsOfExperience;

    setIsSaving(true);
    setServerError('');
    setSuccessMessage('');
    try {
      const endpoint = role === 'TRAINER' ? '/profiles/me/trainer' : '/profiles/me/trainee';
      const payload = await apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setValues(makeFormValues(payload.data?.profile ?? body, role));
      setSuccessMessage('Your profile has been saved.');
      setFieldErrors({});
    } catch (error) {
      setServerError(error.message || 'Could not save your profile.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <main className="profile-page"><p className="page-state" role="status">Loading profile…</p></main>;
  }

  if (loadError) {
    return <main className="profile-page"><p className="page-alert" role="alert">{loadError}</p></main>;
  }

  if (!values) return null;

  return (
    <main className="profile-page">
      <header className="page-header">
        <p className="page-eyebrow">Account</p>
        <h1>Your profile</h1>
        <p>Keep your professional information up to date.</p>
      </header>

      {successMessage && <p className="page-success" role="status">{successMessage}</p>}
      {serverError && <p className="page-alert" role="alert">{serverError}</p>}

      <form className="profile-form" onSubmit={handleSubmit} noValidate>
        <div className="profile-fields">
          {fields.map(([key, label]) => {
            const fieldId = `profile-${key}`;
            const fieldErrorId = `${fieldId}-error`;
            const limit = getFieldLimit(key);
            const isLongText = ['biography', 'qualifications', 'workExperience', 'interests', 'externalCertifications'].includes(key);
            return (
              <div className={`page-field${isLongText ? ' page-field--wide' : ''}`} key={key}>
                <label htmlFor={fieldId}>{label}{limit ? ` (max ${limit})` : ''}</label>
                {isLongText ? (
                  <textarea
                    id={fieldId}
                    value={values[key]}
                    maxLength={limit}
                    rows={4}
                    aria-invalid={Boolean(fieldErrors[key])}
                    aria-describedby={fieldErrors[key] ? fieldErrorId : undefined}
                    onChange={(event) => updateValue(key, event.target.value)}
                  />
                ) : (
                  <input
                    id={fieldId}
                    type="text"
                    value={values[key]}
                    maxLength={limit}
                    aria-invalid={Boolean(fieldErrors[key])}
                    aria-describedby={fieldErrors[key] ? fieldErrorId : undefined}
                    onChange={(event) => updateValue(key, event.target.value)}
                  />
                )}
                {fieldErrors[key] && <span className="page-field-error" id={fieldErrorId} role="alert">{fieldErrors[key]}</span>}
              </div>
            );
          })}

          {role === 'TRAINER' && (
            <div className="page-field">
              <label htmlFor="profile-yearsOfExperience">Years of experience</label>
              <input
                id="profile-yearsOfExperience"
                type="number"
                min="0"
                max="80"
                step="0.1"
                value={values.yearsOfExperience}
                aria-invalid={Boolean(fieldErrors.yearsOfExperience)}
                aria-describedby={fieldErrors.yearsOfExperience ? 'profile-yearsOfExperience-error' : undefined}
                onChange={(event) => updateValue('yearsOfExperience', event.target.value)}
              />
              {fieldErrors.yearsOfExperience && (
                <span className="page-field-error" id="profile-yearsOfExperience-error" role="alert">
                  {fieldErrors.yearsOfExperience}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="page-form-actions">
          <button className="page-button page-button--primary" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </main>
  );
}