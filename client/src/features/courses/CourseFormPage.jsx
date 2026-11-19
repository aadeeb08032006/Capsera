import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  getCourseById,
  createCourse,
  updateCourse,
  publishCourse,
  archiveCourse,
} from './coursesApi.js';
import UiIcon from '../../components/UiIcon.jsx';

export const SUBJECT_OPTIONS = [
  'General',
  'Public Administration',
  'Digital Transformation',
  'Leadership & Governance',
  'Project Management',
  'Data & Analytics',
  'Financial Management',
  'Cybersecurity',
  'Healthcare & Welfare',
  'Procurement & Logistics',
];

export const LEVEL_OPTIONS = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
];

export default function CourseFormPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditMode = Boolean(courseId);

  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    description: '',
    subject: 'General',
    level: 'BEGINNER',
    thumbnailUrl: '',
  });

  const [status, setStatus] = useState('DRAFT');
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Consume one-time flash success state on navigation or clear stale messages on route transition
  useEffect(() => {
    const flash = location.state?.flashSuccess;
    if (flash) {
      setSuccessMsg(flash);
      setError(null);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    if (!isEditMode) {
      setFormData({
        title: '',
        summary: '',
        description: '',
        subject: 'General',
        level: 'BEGINNER',
        thumbnailUrl: '',
      });
      setStatus('DRAFT');
      setLoading(false);
    }
    setSuccessMsg(null);
    setError(null);
  }, [courseId, isEditMode]);

  // Auto-dismiss temporary success feedback
  useEffect(() => {
    if (!successMsg) return undefined;
    const timer = window.setTimeout(() => setSuccessMsg(null), 5500);
    return () => window.clearTimeout(timer);
  }, [successMsg]);

  // Load existing course details if in edit mode
  useEffect(() => {
    if (!isEditMode) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    getCourseById(courseId)
      .then((course) => {
        if (!isMounted || !course) return;
        setFormData({
          title: course.title || '',
          summary: course.summary || '',
          description: course.description || '',
          subject: course.subject || 'General',
          level: course.level || 'BEGINNER',
          thumbnailUrl: course.thumbnailUrl || '',
        });
        setStatus(course.status || 'DRAFT');
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load course details.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [courseId, isEditMode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSuccessMsg(null);
    setError(null);
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      setError('Course title is required.');
      return false;
    }
    if (formData.title.length > 200) {
      setError('Title must be 200 characters or fewer.');
      return false;
    }
    if (formData.summary && formData.summary.length > 500) {
      setError('Summary must be 500 characters or fewer.');
      return false;
    }
    if (formData.thumbnailUrl && formData.thumbnailUrl.trim()) {
      try {
        const parsed = new URL(formData.thumbnailUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setError('Thumbnail URL must be a valid HTTP or HTTPS URL.');
          return false;
        }
      } catch {
        setError('Thumbnail URL must be a valid URL.');
        return false;
      }
    }
    return true;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const payload = {
        title: formData.title.trim(),
        summary: formData.summary.trim() || null,
        description: formData.description.trim() || null,
        subject: formData.subject || null,
        level: formData.level || null,
        thumbnailUrl: formData.thumbnailUrl.trim() || null,
      };

      if (isEditMode) {
        const updated = await updateCourse(courseId, payload);
        setStatus(updated.status);
        setSuccessMsg('Course details saved successfully!');
      } else {
        const created = await createCourse(payload);
        navigate(`/trainer/courses/${created.id}/edit`, {
          replace: true,
          state: { flashSuccess: 'Course created successfully! Add lessons or publish when ready.' },
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to save course. Please check inputs.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!isEditMode) return;

    // Check publishing readiness requirements (title, description, subject, level)
    if (!formData.title.trim() || !formData.description?.trim() || !formData.subject || !formData.level) {
      setError('Publishing requires Title, Description, Subject, and Level to be filled out.');
      return;
    }

    try {
      setPublishing(true);
      setError(null);
      setSuccessMsg(null);

      const updated = await publishCourse(courseId);
      setStatus(updated.status);
      setSuccessMsg('Course published successfully! It is now visible to trainees in the catalogue.');
    } catch (err) {
      setError(err.message || 'Failed to publish course.');
    } finally {
      setPublishing(false);
    }
  };

  const handleArchive = async () => {
    if (!isEditMode) return;

    try {
      setArchiving(true);
      setError(null);
      setSuccessMsg(null);
      setShowArchiveConfirm(false);

      const updated = await archiveCourse(courseId);
      setStatus(updated.status);
      setSuccessMsg('Course archived. It is now hidden from the catalogue for new trainees.');
    } catch (err) {
      setError(err.message || 'Failed to archive course.');
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <main className="courses-page-container" aria-busy="true" aria-live="polite">
        <div className="courses-loading-state">
          <div className="spinner" aria-hidden="true" />
          <p>Loading course information...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="courses-page-container">
      {/* Header & Breadcrumb */}
      <header className="course-form-header">
        <nav className="form-breadcrumbs" aria-label="Course breadcrumb">
          <Link to="/trainer/courses">My Courses</Link>
          <span aria-hidden="true">/</span>
          <span>{isEditMode ? 'Edit Course' : 'Create Course'}</span>
        </nav>

        <div className="form-header-main">
          <div className="form-header-copy">
            <div className="header-status-row">
              <h1>{isEditMode ? (formData.title || 'Untitled Course') : 'Create New Course'}</h1>
              {isEditMode && (
                <span
                  className={`badge ${
                    status === 'PUBLISHED'
                      ? 'badge-published'
                      : status === 'DRAFT'
                      ? 'badge-draft'
                      : 'badge-archived'
                  }`}
                >
                  {status}
                </span>
              )}
            </div>
            <p className="form-header-sub">
              {isEditMode
                ? 'Update course metadata, manage publication status, or organize syllabus lessons.'
                : 'Define core metadata to create a draft course. You can add lessons and assessments next.'}
            </p>
          </div>

          {isEditMode && (
            <div className="form-quick-links">
              <Link
                to={`/trainer/courses/${courseId}/lessons`}
                className="btn btn-secondary ui-inline"
              >
                <UiIcon name="book-open" size={15} />
                Manage Lessons
              </Link>
              <Link
                to={`/courses/${courseId}/assessments/manage`}
                className="btn btn-secondary ui-inline"
              >
                <UiIcon name="bar-chart" size={15} />
                Assessments
              </Link>
              <Link
                to={`/courses/${courseId}`}
                className="btn btn-secondary ui-inline"
              >
                Preview Course
                <UiIcon name="external-link" size={14} />
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Notifications */}
      {error && (
        <div className="form-alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">
            <UiIcon name="alert-triangle" size={18} />
          </span>
          <div className="alert-body">
            <strong>Error:</strong> {error}
          </div>
          <button
            type="button"
            className="form-alert-close"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            <UiIcon name="x" size={14} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="form-alert alert-success" role="status">
          <span className="alert-icon" aria-hidden="true">
            <UiIcon name="check-circle" size={18} />
          </span>
          <div className="alert-body">{successMsg}</div>
          <button
            type="button"
            className="form-alert-close"
            onClick={() => setSuccessMsg(null)}
            aria-label="Dismiss notification"
          >
            <UiIcon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Main Course Form */}
      <form onSubmit={handleSave} className="course-editor-form" noValidate>
        <section className="form-card" aria-labelledby="basic-info-heading">
          <h2 id="basic-info-heading">Basic Information</h2>

          {/* Title */}
          <div className="form-group">
            <label htmlFor="course-title" className="form-label">
              Course Title <span className="required-star">*</span>
            </label>
            <input
              id="course-title"
              name="title"
              type="text"
              className="form-control"
              placeholder="e.g. Modern Project Leadership in Public Administration"
              value={formData.title}
              onChange={handleChange}
              maxLength={200}
              required
              aria-describedby="title-hint"
            />
            <small id="title-hint" className="form-hint">
              Clear and concise title (max 200 characters). {200 - formData.title.length} remaining.
            </small>
          </div>

          {/* Summary */}
          <div className="form-group">
            <label htmlFor="course-summary" className="form-label">
              Short Summary
            </label>
            <textarea
              id="course-summary"
              name="summary"
              rows={2}
              className="form-control"
              placeholder="A brief 1-2 sentence overview shown on course cards in the catalogue."
              value={formData.summary}
              onChange={handleChange}
              maxLength={500}
              aria-describedby="summary-hint"
            />
            <small id="summary-hint" className="form-hint">
              Max 500 characters. {500 - formData.summary.length} remaining.
            </small>
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="course-description" className="form-label">
              Detailed Description & Objectives
            </label>
            <textarea
              id="course-description"
              name="description"
              rows={6}
              className="form-control"
              placeholder="Detailed description of course objectives, target audience, and syllabus..."
              value={formData.description}
              onChange={handleChange}
              maxLength={20000}
              aria-describedby="desc-hint"
            />
            <small id="desc-hint" className="form-hint">
              Required before publishing. Markdown or plain text supported.
            </small>
          </div>
        </section>

        {/* Classification & Media */}
        <section className="form-card" aria-labelledby="classification-heading">
          <h2 id="classification-heading">Classification & Media</h2>

          <div className="form-row-grid">
            {/* Subject */}
            <div className="form-group">
              <label htmlFor="course-subject" className="form-label">
                Subject Category
              </label>
              <select
                id="course-subject"
                name="subject"
                className="form-control"
                value={formData.subject}
                onChange={handleChange}
              >
                {SUBJECT_OPTIONS.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>

            {/* Level */}
            <div className="form-group">
              <label htmlFor="course-level" className="form-label">
                Skill Level
              </label>
              <select
                id="course-level"
                name="level"
                className="form-control"
                value={formData.level}
                onChange={handleChange}
              >
                {LEVEL_OPTIONS.map((lvl) => (
                  <option key={lvl.value} value={lvl.value}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Thumbnail URL */}
          <div className="form-group">
            <label htmlFor="course-thumbnail" className="form-label">
              Thumbnail Image URL (Optional)
            </label>
            <input
              id="course-thumbnail"
              name="thumbnailUrl"
              type="url"
              className="form-control"
              placeholder="https://images.example.com/course-cover.jpg"
              value={formData.thumbnailUrl}
              onChange={handleChange}
              aria-describedby="thumb-hint"
            />
            <small id="thumb-hint" className="form-hint">
              Direct URL to a 16:9 banner or cover image.
            </small>
          </div>
        </section>

        {/* Action Controls & Publication State Buttons */}
        <div className="form-actions-bar">
          <div className="actions-left">
            <button
              type="submit"
              className="btn btn-primary ui-inline"
              disabled={saving || publishing || archiving}
            >
              <UiIcon name="check" size={15} />
              {saving
                ? 'Saving...'
                : isEditMode
                ? 'Save Changes'
                : 'Create Course (Save Draft)'}
            </button>

            <Link to="/trainer/courses" className="btn btn-ghost">
              Cancel
            </Link>
          </div>

          {isEditMode && (
            <div className="actions-right">
              {/* Publish Button */}
              {status !== 'PUBLISHED' && (
                <button
                  type="button"
                  className="btn btn-publish ui-inline"
                  disabled={publishing || saving || archiving}
                  onClick={handlePublish}
                  title="Make this course live for trainees in the catalogue"
                >
                  <UiIcon name="check-circle" size={15} />
                  {publishing ? 'Publishing...' : 'Publish Course'}
                </button>
              )}

              {/* Archive Button */}
              {status !== 'ARCHIVED' && (
                <button
                  type="button"
                  className="btn btn-danger-outline ui-inline"
                  disabled={archiving || saving || publishing}
                  onClick={() => setShowArchiveConfirm(true)}
                  title="Archive course to retire it from new enrollments"
                >
                  <UiIcon name="archive" size={15} />
                  Archive Course
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      {/* Archive Confirmation Modal / Overlay */}
      {showArchiveConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="archive-modal-title">
          <div className="modal-content">
            <h3 id="archive-modal-title">Confirm Course Archival</h3>
            <p>
              Are you sure you want to archive <strong>{formData.title || 'this course'}</strong>?
            </p>
            <p className="modal-note">
              Archived courses are hidden from the catalogue for new trainees. Existing enrollments and
              student progress will remain intact.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={archiving}
                onClick={handleArchive}
              >
                {archiving ? 'Archiving...' : 'Yes, Archive Course'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={archiving}
                onClick={() => setShowArchiveConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}