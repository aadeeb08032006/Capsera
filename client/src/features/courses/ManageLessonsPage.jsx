import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getCourseById,
  listLessons,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
} from './coursesApi.js';

export default function ManageLessonsPage() {
  const { courseId } = useParams();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
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

  // Fetch course and lessons
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [courseData, lessonsList] = await Promise.all([
        getCourseById(courseId),
        listLessons(courseId),
      ]);

      setCourse(courseData);
      setLessons(lessonsList || []);
    } catch (err) {
      setError(err.message || 'Failed to load lessons data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [courseId]);

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
      <header className="manage-lessons-header">
        <div className="form-breadcrumbs">
          <Link to={`/trainer/courses/${courseId}/edit`}>← Back to Course Edit</Link>
          <span aria-hidden="true"> / </span>
          <Link to="/trainer/courses">My Courses</Link>
        </div>

        <div className="header-content-row">
          <div>
            <span className="trainer-badge">Curriculum Management</span>
            <h1>Manage Lessons: {course?.title || 'Course'}</h1>
            <p className="form-header-sub">
              Add lessons, provide structured instructional content, and arrange the syllabus order.
            </p>
          </div>

          <div className="header-stats-pill">
            <span>📚 {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} total</span>
          </div>
        </div>
      </header>

      {/* Notifications */}
      {error && (
        <div className="form-alert alert-error" role="alert">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div className="alert-body">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {successMsg && (
        <div className="form-alert alert-success" role="status">
          <span className="alert-icon" aria-hidden="true">✓</span>
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
                      ▲
                    </button>
                    <button
                      type="button"
                      className="order-btn"
                      disabled={idx === lessons.length - 1 || reordering}
                      onClick={() => handleMove(idx, 'down')}
                      aria-label={`Move lesson ${idx + 1} down`}
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                </div>

                <div className="lesson-summary-info">
                  <div className="lesson-title-row">
                    <h3 className="lesson-item-title">{lesson.title}</h3>
                    {lesson.estimatedDurationMinutes && (
                      <span className="lesson-duration-badge">
                        ⏱ {lesson.estimatedDurationMinutes} mins
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
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleStartEdit(lesson)}
                    aria-label={`Edit ${lesson.title}`}
                  >
                    ✏ Edit
                  </button>
                  <Link
                    to={`/courses/${courseId}/lessons/${lesson.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-secondary"
                    title="View in Lesson Viewer"
                  >
                    Preview ↗
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

      {/* Delete Lesson Confirmation Modal */}
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