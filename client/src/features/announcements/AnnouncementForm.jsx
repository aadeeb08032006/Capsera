import React, { useEffect, useId, useState } from 'react';
import { ANNOUNCEMENT_CATEGORIES } from './announcementsApi.js';
import './announcements.css';

function toLocalDateTimeInput(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Reusable form for creating a draft/published announcement or editing an
 * existing draft/published announcement.
 */
export default function AnnouncementForm({
  editingAnnouncement = null,
  isSubmitting = false,
  serverError = null,
  onSubmit,
  onCancelEdit,
}) {
  const titleId = useId();
  const categoryId = useId();
  const bodyId = useId();
  const expiresAtId = useId();

  const isEditing = Boolean(editingAnnouncement);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('ANNOUNCEMENT');
  const [body, setBody] = useState('');
  const [expiresAtInput, setExpiresAtInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (editingAnnouncement) {
      setTitle(editingAnnouncement.title ?? '');
      setCategory(editingAnnouncement.category ?? 'ANNOUNCEMENT');
      setBody(editingAnnouncement.body ?? '');
      setExpiresAtInput(toLocalDateTimeInput(editingAnnouncement.expiresAt));
    } else {
      setTitle('');
      setCategory('ANNOUNCEMENT');
      setBody('');
      setExpiresAtInput('');
    }
    setFieldErrors({});
  }, [editingAnnouncement]);

  function validate(targetStatus) {
    const errors = {};
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!trimmedTitle) {
      errors.title = 'Title is required.';
    } else if (trimmedTitle.length > 200) {
      errors.title = 'Title must be 200 characters or fewer.';
    }

    if (!trimmedBody) {
      errors.body = 'Body is required.';
    }

    let expiresAt = null;
    if (expiresAtInput.trim() !== '') {
      const parsedExpiry = new Date(expiresAtInput);
      if (Number.isNaN(parsedExpiry.getTime())) {
        errors.expiresAt = 'Enter a valid expiration date and time.';
      } else {
        const referenceDate = isEditing
          ? editingAnnouncement.publishedAt
            ? new Date(editingAnnouncement.publishedAt)
            : null
          : targetStatus === 'PUBLISHED'
            ? new Date()
            : null;

        if (referenceDate && parsedExpiry.getTime() <= referenceDate.getTime()) {
          errors.expiresAt = isEditing
            ? 'Expiration date must be later than the publication timestamp.'
            : 'Expiration date must be in the future when publishing immediately.';
        } else {
          expiresAt = parsedExpiry.toISOString();
        }
      }
    }

    return {
      errors,
      payload: {
        title: trimmedTitle,
        body: trimmedBody,
        category,
        expiresAt,
      },
    };
  }

  async function handleAction(targetStatus) {
    if (isSubmitting) return;
    const { errors, payload } = validate(targetStatus);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const finalPayload = isEditing ? payload : { ...payload, status: targetStatus };
    const succeeded = await onSubmit(finalPayload);
    if (succeeded && !isEditing) {
      setTitle('');
      setCategory('ANNOUNCEMENT');
      setBody('');
      setExpiresAtInput('');
      setFieldErrors({});
    }
  }

  return (
    <form
      className="announcements-form"
      onSubmit={(event) => {
        event.preventDefault();
        handleAction(isEditing ? editingAnnouncement.status : 'DRAFT');
      }}
      noValidate
    >
      {serverError && (
        <div className="announcements-banner announcements-banner-error" role="alert">
          <span>{serverError}</span>
        </div>
      )}

      <div className="announcements-form-row">
        <div className="announcements-field">
          <label className="announcements-label" htmlFor={titleId}>
            Title
          </label>
          <input
            id={titleId}
            type="text"
            maxLength={200}
            className={`announcements-input ${
              fieldErrors.title ? 'announcements-input-error' : ''
            }`.trim()}
            placeholder="e.g. Spring Onboarding Open"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setFieldErrors((prev) => ({ ...prev, title: undefined }));
            }}
            disabled={isSubmitting}
            required
          />
          {fieldErrors.title && (
            <p className="announcements-field-error" role="alert">
              {fieldErrors.title}
            </p>
          )}
        </div>

        <div className="announcements-field">
          <label className="announcements-label" htmlFor={categoryId}>
            Category
          </label>
          <select
            id={categoryId}
            className="announcements-select"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            disabled={isSubmitting}
          >
            {ANNOUNCEMENT_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="announcements-field">
        <label className="announcements-label" htmlFor={bodyId}>
          Body
        </label>
        <textarea
          id={bodyId}
          rows={4}
          className={`announcements-textarea ${
            fieldErrors.body ? 'announcements-input-error' : ''
          }`.trim()}
          placeholder="Write the announcement details..."
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setFieldErrors((prev) => ({ ...prev, body: undefined }));
          }}
          disabled={isSubmitting}
          required
        />
        {fieldErrors.body && (
          <p className="announcements-field-error" role="alert">
            {fieldErrors.body}
          </p>
        )}
      </div>

      <div className="announcements-field">
        <label className="announcements-label" htmlFor={expiresAtId}>
          Expiration Date (Optional)
        </label>
        <input
          id={expiresAtId}
          type="datetime-local"
          className={`announcements-input ${
            fieldErrors.expiresAt ? 'announcements-input-error' : ''
          }`.trim()}
          value={expiresAtInput}
          onChange={(event) => {
            setExpiresAtInput(event.target.value);
            setFieldErrors((prev) => ({ ...prev, expiresAt: undefined }));
          }}
          disabled={isSubmitting}
        />
        {fieldErrors.expiresAt && (
          <p className="announcements-field-error" role="alert">
            {fieldErrors.expiresAt}
          </p>
        )}
      </div>

      <div className="announcements-form-actions">
        {isEditing ? (
          <>
            <button
              type="submit"
              className="announcements-btn announcements-btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              className="announcements-btn announcements-btn-secondary"
              disabled={isSubmitting}
              onClick={onCancelEdit}
            >
              Cancel Edit
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="announcements-btn announcements-btn-secondary"
              disabled={isSubmitting}
              onClick={() => handleAction('DRAFT')}
            >
              {isSubmitting ? 'Saving...' : 'Save as Draft'}
            </button>
            <button
              type="button"
              className="announcements-btn announcements-btn-primary"
              disabled={isSubmitting}
              onClick={() => handleAction('PUBLISHED')}
            >
              {isSubmitting ? 'Publishing...' : 'Publish Now'}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
