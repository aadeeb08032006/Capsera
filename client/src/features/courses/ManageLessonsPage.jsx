import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getCourseById,
  listLessons,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  listResources,
  deleteResource,
  downloadResourceFile,
} from './coursesApi.js';
import UiIcon from '../../components/UiIcon.jsx';
import ResourceUploadModal from './ResourceUploadModal.jsx';

export default function ManageLessonsPage() {
  const { courseId } = useParams();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [deletingResourceId, setDeletingResourceId] = useState(null);
  const [downloadingResourceId, setDownloadingResourceId] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form state
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    estimatedDurationMinutes: '',
    content: '',
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [reordering, setReordering] = useState(false);

  // Delete modal state
  const [deletingLesson, setDeletingLesson] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const formRef = useRef(null);

  // Fetch course, lessons, and resources
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [courseData, lessonsList, resourcesList] = await Promise.all([
        getCourseById(courseId),
        listLessons(courseId),
        listResources(courseId).catch(() => []),
      ]);

      setCourse(courseData);
      setLessons(lessonsList || []);
      setResources(resourcesList || []);
    } catch (err) {
      setError(err.message || 'Failed to load lessons data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setError(null);
    setSuccessMsg(null);
    setDownloadError(null);
    setDownloadSuccess(null);
    resetForm();
    loadData();
  }, [courseId]);

  useEffect(() => {
    if (!downloadSuccess) return undefined;
    const timer = window.setTimeout(() => setDownloadSuccess(null), 5500);
    return () => window.clearTimeout(timer);
  }, [downloadSuccess]);

  useEffect(() => {
    if (!successMsg) return undefined;
    const timer = window.setTimeout(() => setSuccessMsg(null), 5500);
    return () => window.clearTimeout(timer);
  }, [successMsg]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccessMsg(null);
  };

  const resetForm = () => {
    setEditingLessonId(null);
    setFormData({
      title: '',
      estimatedDurationMinutes: '',
      content: '',
    });
  };

  const handleStartEdit = (lesson) => {
    setEditingLessonId(lesson.id);
    setFormData({
      title: lesson.title || '',
      estimatedDurationMinutes: lesson.estimatedDurationMinutes ? String(lesson.estimatedDurationMinutes) : '',
      content: lesson.content || '',
    });
    setError(null);
    setSuccessMsg(null);

    // Scroll form into view
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Lesson title is required.');
      return;
    }

    try {
      setFormSubmitting(true);
      setError(null);
      setSuccessMsg(null);

      const payload = {
        title: formData.title.trim(),
        content: formData.content.trim() || null,
        estimatedDurationMinutes: formData.estimatedDurationMinutes
          ? parseInt(formData.estimatedDurationMinutes, 10)
          : null,
      };

      if (editingLessonId) {
        const updated = await updateLesson(editingLessonId, payload);
        setLessons((prev) =>
          prev.map((l) => (String(l.id) === String(editingLessonId) ? updated : l)),
        );
        setSuccessMsg(`Lesson "${updated.title}" updated successfully!`);
        resetForm();
      } else {
        const created = await createLesson(courseId, payload);
        setLessons((prev) => [...prev, created]);
        setSuccessMsg(`Lesson "${created.title}" created successfully!`);
        resetForm();
      }
    } catch (err) {
      setError(err.message || 'Failed to save lesson.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Reorder lessons (move up or down)
  const handleMove = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;

    const newLessons = [...lessons];
    const [movedLesson] = newLessons.splice(index, 1);
    newLessons.splice(targetIndex, 0, movedLesson);

    // Immediate UI feedback
    setLessons(newLessons);

    try {
      setReordering(true);
      setError(null);
      const lessonIds = newLessons.map((l) => String(l.id));
      const reorderedList = await reorderLessons(courseId, lessonIds);
      setLessons(reorderedList);
      setSuccessMsg('Lesson order updated.');
    } catch (err) {
      setError(err.message || 'Failed to update lesson order.');
      // Revert on failure
      loadData();
    } finally {
      setReordering(false);
    }
  };

  // Delete lesson
  const handleDeleteConfirm = async () => {
    if (!deletingLesson) return;

    try {
      setDeleteSubmitting(true);
      setError(null);
      setSuccessMsg(null);

      await deleteLesson(deletingLesson.id);
      setLessons((prev) => prev.filter((l) => String(l.id) !== String(deletingLesson.id)));
      setSuccessMsg(`Lesson "${deletingLesson.title}" deleted.`);
      setDeletingLesson(null);

      if (editingLessonId === deletingLesson.id) {
        resetForm();
      }
    } catch (err) {
      setError(err.message || 'Failed to delete lesson.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Download resource (authenticated Blob download)
  const handleDownloadResource = async (resource) => {
    try {
      setDownloadingResourceId(resource.id);
      setDownloadError(null);
      setDownloadSuccess(null);

      const fallbackFilename = resource.originalFilename || resource.title || 'resource-file';
      const result = await downloadResourceFile(courseId, resource.id, fallbackFilename);
      setDownloadSuccess(`Downloaded "${result?.filename || fallbackFilename}" successfully.`);
    } catch (err) {
      setDownloadError(err.message || 'Failed to download resource file.');
    } finally {
      setDownloadingResourceId(null);
    }
  };

  // Delete resource
  const handleDeleteResource = async (resourceId) => {
    try {
      setDeletingResourceId(resourceId);
      setError(null);
      await deleteResource(courseId, resourceId);
      setResources((prev) => prev.filter((r) => String(r.id) !== String(resourceId)));
      setSuccessMsg('Resource removed successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete resource.');
    } finally {
      setDeletingResourceId(null);
    }
  };

  if (loading) {
    return (
      <main className="courses-page-container" aria-busy="true" aria-live="polite">
        <div className="courses-loading-state">
          <div className="spinner" aria-hidden="true" />
          <p>Loading course curriculum...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="courses-page-container">
      {/* Header & Navigation */}
      <header className="course-form-header manage-lessons-header">
        <nav className="form-breadcrumbs" aria-label="Curriculum breadcrumb">
          <Link to="/trainer/courses">My Courses</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/trainer/courses/${courseId}/edit`}>Back to Course Edit</Link>
          <span aria-hidden="true">/</span>
          <span>Manage Lessons</span>
        </nav>

        <div className="header-content-row">
          <div className="form-header-copy">
            <h1>{course?.title || 'Course'} Syllabus</h1>
            <p className="form-header-sub">
              Add lessons, attach study resources, and arrange syllabus order.
            </p>
          </div>

          <div className="header-stats-pill">
            <span className="ui-inline">
              <UiIcon name="book-open" size={15} />
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} total
            </span>
          </div>
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
        </div>
      )}

      {successMsg && (
        <div className="form-alert alert-success" role="status">
          <span className="alert-icon" aria-hidden="true">
            <UiIcon name="check-circle" size={18} />
          </span>
          <div className="alert-body">{successMsg}</div>
        </div>
      )}

      {/* Lessons List Section */}
      <section className="manage-lessons-section" aria-labelledby="curriculum-list-heading">
        <div className="section-title-bar">
          <h2 id="curriculum-list-heading">Ordered Course Syllabus</h2>
          {reordering && <span className="reordering-indicator">Saving order...</span>}
        </div>

        {lessons.length === 0 ? (
          <div className="courses-empty-state" role="region" aria-labelledby="empty-curriculum-heading">
            <h3 id="empty-curriculum-heading">No lessons added yet</h3>
            <p>Your course currently has no lessons. Use the form below to create your first lesson.</p>
          </div>
        ) : (
          <ol className="manage-lessons-list">
            {lessons.map((lesson, idx) => (
              <li key={lesson.id} className="manage-lesson-item">
                <div className="lesson-order-handle" title={`Lesson position: ${idx + 1}`}>
                  <span className="order-number">{idx + 1}</span>
                  <div className="order-btn-group">
                    <button
                      type="button"
                      className="order-btn"
                      disabled={idx === 0 || reordering}
                      onClick={() => handleMove(idx, 'up')}
                      aria-label={`Move lesson ${idx + 1} up`}
                      title="Move up"
                    >
                      <UiIcon name="chevron-up" size={14} />
                    </button>
                    <button
                      type="button"
                      className="order-btn"
                      disabled={idx === lessons.length - 1 || reordering}
                      onClick={() => handleMove(idx, 'down')}
                      aria-label={`Move lesson ${idx + 1} down`}
                      title="Move down"
                    >
                      <UiIcon name="chevron-down" size={14} />
                    </button>
                  </div>
                </div>

                <div className="lesson-summary-info">
                  <div className="lesson-title-row">
                    <h3 className="lesson-item-title">{lesson.title}</h3>
                    {lesson.estimatedDurationMinutes && (
                      <span className="lesson-duration-badge ui-inline">
                        <UiIcon name="clock" size={13} />
                        {lesson.estimatedDurationMinutes} mins
                      </span>
                    )}
                  </div>
                  {lesson.content ? (
                    <p className="lesson-item-snippet">
                      {lesson.content.slice(0, 140)}
                      {lesson.content.length > 140 ? '...' : ''}
                    </p>
                  ) : (
                    <span className="lesson-item-empty">No written text provided</span>
                  )}
                </div>

                <div className="lesson-item-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary ui-inline"
                    onClick={() => handleStartEdit(lesson)}
                    aria-label={`Edit ${lesson.title}`}
                  >
                    <UiIcon name="edit" size={14} />
                    Edit
                  </button>
                  <Link
                    to={`/courses/${courseId}/lessons/${lesson.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-secondary ui-inline"
                    title="View in Lesson Viewer"
                  >
                    Preview
                    <UiIcon name="external-link" size={13} />
                  </Link>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => setDeletingLesson(lesson)}
                    aria-label={`Delete ${lesson.title}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Add / Edit Lesson Form Section */}
      <section ref={formRef} className="lesson-editor-section" aria-labelledby="lesson-form-heading">
        <div className="form-card">
          <div className="form-card-header">
            <h2 id="lesson-form-heading">
              {editingLessonId ? `Edit Lesson: ${formData.title || 'Untitled'}` : '+ Add New Lesson'}
            </h2>
            {editingLessonId && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {/* Title */}
            <div className="form-group">
              <label htmlFor="lesson-title" className="form-label">
                Lesson Title <span className="required-star">*</span>
              </label>
              <input
                id="lesson-title"
                name="title"
                type="text"
                className="form-control"
                placeholder="e.g. Introduction to Policy Implementation"
                value={formData.title}
                onChange={handleInputChange}
                maxLength={200}
                required
                aria-describedby="lesson-title-hint"
              />
              <small id="lesson-title-hint" className="form-hint">
                Max 200 characters. {200 - formData.title.length} remaining.
              </small>
            </div>

            {/* Estimated Duration */}
            <div className="form-group">
              <label htmlFor="lesson-duration" className="form-label">
                Estimated Duration (Minutes)
              </label>
              <input
                id="lesson-duration"
                name="estimatedDurationMinutes"
                type="number"
                min="1"
                max="10080"
                className="form-control"
                placeholder="e.g. 20"
                value={formData.estimatedDurationMinutes}
                onChange={handleInputChange}
                aria-describedby="lesson-duration-hint"
              />
              <small id="lesson-duration-hint" className="form-hint">
                Approximate completion time in minutes (optional).
              </small>
            </div>

            {/* Content */}
            <div className="form-group">
              <label htmlFor="lesson-content" className="form-label">
                Lesson Instructional Content
              </label>
              <textarea
                id="lesson-content"
                name="content"
                rows={8}
                className="form-control"
                placeholder="Write instructional material, explanations, links, or discussion notes..."
                value={formData.content}
                onChange={handleInputChange}
                maxLength={50000}
                aria-describedby="lesson-content-hint"
              />
              <small id="lesson-content-hint" className="form-hint">
                Markdown or plain text instructions for students (max 50,000 characters).
              </small>
            </div>

            {/* Form Submit Button */}
            <div className="lesson-form-actions">
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={formSubmitting}
              >
                {formSubmitting
                  ? 'Saving...'
                  : editingLessonId
                  ? 'Update Lesson'
                  : 'Add Lesson to Course'}
              </button>

              {editingLessonId && (
                <button
                  type="button"
                  className="btn btn-secondary btn-lg"
                  onClick={resetForm}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Course Resources Section */}
      <section className="manage-resources-section" aria-labelledby="resources-management-heading">
        <div className="section-title-bar">
          <div>
            <h2 id="resources-management-heading">Course Resources & Materials</h2>
            <p className="section-subtitle">
              Upload study guides, presentations, datasets, and reference links for this course.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setUploadModalOpen(true)}
          >
            + Upload New Resource
          </button>
        </div>

        {downloadError && (
          <div className="form-alert alert-error" role="alert">
            <span className="alert-icon" aria-hidden="true">
              <UiIcon name="alert-triangle" size={18} />
            </span>
            <div className="alert-body">{downloadError}</div>
            <button
              type="button"
              className="form-alert-close"
              aria-label="Dismiss download error"
              onClick={() => setDownloadError(null)}
            >
              <UiIcon name="x" size={15} />
            </button>
          </div>
        )}

        {downloadSuccess && (
          <div className="form-alert alert-success" role="status">
            <span className="alert-icon" aria-hidden="true">
              <UiIcon name="check" size={18} />
            </span>
            <div className="alert-body">{downloadSuccess}</div>
            <button
              type="button"
              className="form-alert-close"
              aria-label="Dismiss download confirmation"
              onClick={() => setDownloadSuccess(null)}
            >
              <UiIcon name="x" size={15} />
            </button>
          </div>
        )}

        {resources.length === 0 ? (
          <div className="courses-empty-state" role="region" aria-labelledby="empty-res-heading">
            <h3 id="empty-res-heading">No resources uploaded yet</h3>
            <p>Upload slides, PDFs, or external links to complement your lessons.</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setUploadModalOpen(true)}
            >
              Upload First Resource
            </button>
          </div>
        ) : (
          <div className="resources-manage-grid">
            {resources.map((res) => {
              const assignedLesson = lessons.find((l) => String(l.id) === String(res.lessonId));
              return (
                <div key={res.id} className="resource-manage-card">
                  <div className="res-card-top">
                    <span className="res-type-badge">{res.resourceType || 'DOCUMENT'}</span>
                    {res.fileSizeBytes && (
                      <span className="res-size-badge">
                        {(res.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    )}
                  </div>

                  <h3 className="res-card-title">{res.title}</h3>

                  <div className="res-card-meta">
                    <span className="res-scope-tag">
                      {assignedLesson ? `Lesson: ${assignedLesson.title}` : 'All Course Lessons'}
                    </span>
                  </div>

                  <div className="res-card-actions">
                    {res.externalUrl ? (
                      <a
                        href={res.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary ui-inline"
                      >
                        Visit Link
                        <UiIcon name="external-link" size={13} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={downloadingResourceId === res.id}
                        onClick={() => handleDownloadResource(res)}
                      >
                        {downloadingResourceId === res.id ? 'Downloading...' : 'Download'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={deletingResourceId === res.id}
                      onClick={() => handleDeleteResource(res.id)}
                    >
                      {deletingResourceId === res.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Upload Resource Modal */}
      <ResourceUploadModal
        courseId={courseId}
        lessons={lessons}
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={(newResource) => {
          setResources((prev) => [...prev, newResource]);
          setSuccessMsg(`Resource "${newResource.title}" uploaded successfully!`);
        }}
      />
      {deletingLesson && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="del-modal-title">
          <div className="modal-content">
            <h3 id="del-modal-title">Delete Lesson</h3>
            <p>
              Are you sure you want to permanently delete lesson{' '}
              <strong>"{deletingLesson.title}"</strong>?
            </p>
            <p className="modal-note">
              This action cannot be undone. Any recorded trainee progress on this specific lesson
              will also be removed.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleteSubmitting}
                onClick={handleDeleteConfirm}
              >
                {deleteSubmitting ? 'Deleting...' : 'Yes, Delete Lesson'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={deleteSubmitting}
                onClick={() => setDeletingLesson(null)}
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