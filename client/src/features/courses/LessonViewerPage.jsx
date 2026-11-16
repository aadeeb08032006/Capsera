import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  getCourseById,
  getMyEnrollments,
  markLessonProgress,
  listResources,
} from './coursesApi.js';

export default function LessonViewerPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [enrollment, setEnrollment] = useState(null);
  const [completedLessonIds, setCompletedLessonIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marking, setMarking] = useState(false);
  const [markSuccess, setMarkSuccess] = useState(false);
  const [markError, setMarkError] = useState(null);
  const [completionBanner, setCompletionBanner] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isTrainee = user?.role === 'TRAINEE';
  const isTrainerOrAdmin = user?.role === 'TRAINER' || user?.role === 'ADMIN';

  // Fetch course, lessons, and enrollment details
  const loadViewerData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load course details (includes lessons for enrolled trainees & trainers/admins)
      const courseData = await getCourseById(courseId);
      setCourse(courseData);

      const orderedLessons = courseData?.lessons || [];
      setLessons(orderedLessons);

      // Trainee specific: fetch enrollment to get progress and enrollmentId
      if (isTrainee) {
        try {
          const enrollments = await getMyEnrollments();
          const currentEnrollment = enrollments.find(
            (e) => String(e.courseId) === String(courseId),
          );
          setEnrollment(currentEnrollment || null);
        } catch {
          // Non-blocking: enrollment might not exist yet if previewing
        }
      }

      // Fetch course resources for download
      try {
        const resourceList = await listResources(courseId);
        setResources(resourceList || []);
      } catch {
        // Resources fetch is optional
      }
    } catch (err) {
      setError(err.message || 'Failed to load lesson. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadViewerData();
  }, [courseId]);

  // Current lesson determination
  const currentLessonIndex = useMemo(() => {
    if (!lessons.length) return -1;
    return lessons.findIndex((l) => String(l.id) === String(lessonId));
  }, [lessons, lessonId]);

  const currentLesson = useMemo(() => {
    if (currentLessonIndex >= 0) return lessons[currentLessonIndex];
    return null;
  }, [lessons, currentLessonIndex]);

  // Reset mark feedback on lesson switch
  useEffect(() => {
    setMarkSuccess(false);
    setMarkError(null);
  }, [lessonId]);

  // Handle Mark Complete
  const handleMarkComplete = async () => {
    if (!enrollment?.id || !currentLesson?.id) return;

    try {
      setMarking(true);
      setMarkError(null);

      const res = await markLessonProgress(enrollment.id, currentLesson.id);

      // Add to completed set
      setCompletedLessonIds((prev) => new Set(prev).add(String(currentLesson.id)));
      setMarkSuccess(true);

      // Check if course completed
      if (res?.isComplete || res?.progressPercentage === 100) {
        setCompletionBanner(true);
      }
    } catch (err) {
      setMarkError(err.message || 'Unable to update lesson progress.');
    } finally {
      setMarking(false);
    }
  };

  const isCurrentCompleted = currentLesson?.id
    ? completedLessonIds.has(String(currentLesson.id))
    : false;

  // Navigation handlers
  const prevLesson = currentLessonIndex > 0 ? lessons[currentLessonIndex - 1] : null;
  const nextLesson =
    currentLessonIndex >= 0 && currentLessonIndex < lessons.length - 1
      ? lessons[currentLessonIndex + 1]
      : null;

  const goToLesson = (targetLessonId) => {
    navigate(`/courses/${courseId}/lessons/${targetLessonId}`);
    setSidebarOpen(false);
  };

  // Loading state
  if (loading) {
    return (
      <main className="courses-page-container" aria-busy="true" aria-live="polite">
        <div className="courses-loading-state">
          <div className="spinner" aria-hidden="true" />
          <p>Loading lesson content...</p>
        </div>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main className="courses-page-container">
        <div className="courses-error-state" role="alert">
          <h2>Failed to Load Lesson</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={loadViewerData}
            >
              Try Again
            </button>
            <Link to={`/courses/${courseId}`} className="btn btn-secondary">
              Back to Course
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Trainee not enrolled state
  if (isTrainee && !enrollment) {
    return (
      <main className="courses-page-container">
        <div className="courses-empty-state" role="region" aria-labelledby="not-enrolled-heading">
          <h2 id="not-enrolled-heading">Course Enrollment Required</h2>
          <p>
            You must be enrolled in <strong>{course?.title || 'this course'}</strong> to access
            its lessons and study materials.
          </p>
          <Link to={`/courses/${courseId}`} className="btn btn-primary">
            View Course & Enroll
          </Link>
        </div>
      </main>
    );
  }

  // Empty state: course has no lessons
  if (!lessons.length) {
    return (
      <main className="courses-page-container">
        <div className="courses-empty-state" role="region" aria-labelledby="no-lessons-heading">
          <h2 id="no-lessons-heading">No Lessons Available</h2>
          <p>This course does not have any published lessons yet.</p>
          <Link to={`/courses/${courseId}`} className="btn btn-secondary">
            Return to Course Detail
          </Link>
        </div>
      </main>
    );
  }

  // Lesson not found state
  if (!currentLesson) {
    return (
      <main className="courses-page-container">
        <div className="courses-empty-state" role="region" aria-labelledby="lesson-not-found-heading">
          <h2 id="lesson-not-found-heading">Lesson Not Found</h2>
          <p>The requested lesson could not be found in this course.</p>
          {lessons.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => goToLesson(lessons[0].id)}
            >
              Go to First Lesson: {lessons[0].title}
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="lesson-viewer-layout">
      {/* Mobile Toggle for Curriculum Drawer */}
      <div className="viewer-mobile-bar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-expanded={sidebarOpen}
          aria-controls="curriculum-sidebar"
        >
          {sidebarOpen ? '✕ Close Curriculum' : '☰ Course Lessons'}
        </button>
        <span className="mobile-lesson-indicator">
          Lesson {currentLessonIndex + 1} of {lessons.length}
        </span>
      </div>

      {/* Curriculum Sidebar */}
      <aside
        id="curriculum-sidebar"
        className={`viewer-sidebar ${sidebarOpen ? 'open' : ''}`}
        aria-label="Course Curriculum"
      >
        <div className="sidebar-header">
          <Link to={`/courses/${courseId}`} className="back-course-link" title="Back to course overview">
            ← {course?.title || 'Course Overview'}
          </Link>
          <h3>Course Content</h3>
          <span className="sidebar-stats">
            {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
          </span>
        </div>

        <nav className="curriculum-nav" aria-label="Lessons List">
          <ol className="sidebar-lesson-list">
            {lessons.map((lesson, idx) => {
              const isActive = String(lesson.id) === String(lessonId);
              const isDone = completedLessonIds.has(String(lesson.id));

              return (
                <li key={lesson.id} className="sidebar-lesson-item">
                  <button
                    type="button"
                    className={`sidebar-lesson-btn ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}`}
                    onClick={() => goToLesson(lesson.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="lesson-badge-num">
                      {isDone ? '✓' : idx + 1}
                    </span>
                    <span className="lesson-title-text">{lesson.title}</span>
                    {lesson.estimatedDurationMinutes && (
                      <span className="lesson-duration-tag">
                        {lesson.estimatedDurationMinutes}m
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>

      {/* Main Lesson Stage */}
      <main className="viewer-main-content" tabIndex="-1">
        {/* Course Completion Celebration Banner */}
        {completionBanner && (
          <div className="completion-banner" role="status" aria-live="polite">
            <div className="banner-icon" aria-hidden="true">🎉</div>
            <div className="banner-text">
              <h3>Congratulations!</h3>
              <p>You have completed all lessons for <strong>{course?.title}</strong>!</p>
            </div>
            <Link to="/my-learning" className="btn btn-sm btn-primary">
              View My Learning
            </Link>
          </div>
        )}

        {/* Lesson Header */}
        <header className="lesson-stage-header">
          <div className="lesson-breadcrumbs">
            <Link to="/courses">Catalogue</Link>
            <span aria-hidden="true"> / </span>
            <Link to={`/courses/${courseId}`}>{course?.title}</Link>
            <span aria-hidden="true"> / </span>
            <span>Lesson {currentLessonIndex + 1}</span>
          </div>

          <div className="lesson-header-row">
            <div>
              <span className="lesson-position-badge">
                Lesson {currentLessonIndex + 1} of {lessons.length}
              </span>
              <h1 className="lesson-stage-title">{currentLesson.title}</h1>
            </div>

            {currentLesson.estimatedDurationMinutes && (
              <span className="duration-pill">
                ⏱ {currentLesson.estimatedDurationMinutes} mins estimated
              </span>
            )}
          </div>
        </header>

        {/* Lesson Body */}
        <article className="lesson-body-card">
          {currentLesson.content ? (
            <div className="lesson-content-text">
              {currentLesson.content.split('\n\n').map((paragraph, pIdx) => (
                <p key={pIdx}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <div className="lesson-empty-content">
              <p>No written instructions provided for this lesson.</p>
            </div>
          )}
        </article>

        {/* Lesson Resources Section */}
        {resources.length > 0 && (
          <section className="lesson-resources-card" aria-labelledby="resources-heading">
            <h2 id="resources-heading">Lesson Resources & Downloads</h2>
            <ul className="resource-list">
              {resources.map((resource) => (
                <li key={resource.id} className="resource-item">
                  <span className="resource-icon" aria-hidden="true">📄</span>
                  <div className="resource-info">
                    <span className="resource-title">{resource.title}</span>
                    <span className="resource-type-badge">{resource.resourceType || 'DOCUMENT'}</span>
                  </div>
                  {resource.externalUrl ? (
                    <a
                      href={resource.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-secondary"
                    >
                      Open Link ↗
                    </a>
                  ) : (
                    <a
                      href={`/api/v1/courses/${courseId}/resources/${resource.id}/download`}
                      download
                      className="btn btn-sm btn-primary"
                    >
                      Download
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Action Controls & Navigation */}
        <footer className="lesson-stage-footer">
          <div className="progress-action-bar">
            {isTrainee && enrollment && (
              <div className="trainee-action-group">
                <button
                  type="button"
                  className={`btn ${isCurrentCompleted || markSuccess ? 'btn-success' : 'btn-primary'} btn-lg`}
                  onClick={handleMarkComplete}
                  disabled={marking || isCurrentCompleted || markSuccess}
                  aria-live="polite"
                >
                  {marking
                    ? 'Updating Progress...'
                    : isCurrentCompleted || markSuccess
                    ? '✓ Lesson Completed'
                    : 'Mark as Complete'}
                </button>

                {markError && (
                  <span className="mark-error-msg" role="alert">
                    {markError}
                  </span>
                )}
                {markSuccess && !isCurrentCompleted && (
                  <span className="mark-success-msg" role="status">
                    Progress saved!
                  </span>
                )}
              </div>
            )}

            {isTrainerOrAdmin && (
              <div className="trainer-preview-notice">
                <span className="badge badge-draft">Trainer Preview Mode</span>
                <p>You are viewing this lesson in management preview.</p>
              </div>
            )}
          </div>

          <div className="lesson-nav-buttons">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!prevLesson}
              onClick={() => prevLesson && goToLesson(prevLesson.id)}
              aria-label={prevLesson ? `Previous: ${prevLesson.title}` : 'No previous lesson'}
            >
              ← Previous Lesson
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={!nextLesson}
              onClick={() => nextLesson && goToLesson(nextLesson.id)}
              aria-label={nextLesson ? `Next: ${nextLesson.title}` : 'No next lesson'}
            >
              Next Lesson →
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}