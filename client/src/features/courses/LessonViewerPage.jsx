import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  getCourseById,
  getMyEnrollments,
  markLessonProgress,
  listResources,
  downloadResourceFile,
} from './coursesApi.js';
import { listAssessmentsByCourse } from '../assessments/assessmentsApi.js';

export default function LessonViewerPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [completedLessonIds, setCompletedLessonIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marking, setMarking] = useState(false);
  const [markSuccess, setMarkSuccess] = useState(false);
  const [markError, setMarkError] = useState(null);
  const [bannerType, setBannerType] = useState(null); // 'COURSE_COMPLETED' | 'ASSESSMENTS_PENDING' | null
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isTrainee = user?.role === 'TRAINEE';
  const isTrainerOrAdmin = user?.role === 'TRAINER' || user?.role === 'ADMIN';

  // Fetch course, lessons, enrollment details, and assessments
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

          if (currentEnrollment) {
            if (currentEnrollment.status === 'COMPLETED') {
              setBannerType('COURSE_COMPLETED');
            } else if (currentEnrollment.progressPercentage === 100) {
              setBannerType('ASSESSMENTS_PENDING');
            }
          }
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

      // Fetch course assessments for navigation and requirement checks (Member 3)
      try {
        const assessmentData = await listAssessmentsByCourse(courseId);
        const items = Array.isArray(assessmentData) ? assessmentData : (assessmentData?.items || []);
        setAssessments(items);
      } catch {
        setAssessments([]);
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

      // Only show course completion celebration if course is genuinely complete (all lessons + required assessments passed)
      if (res?.isComplete || res?.status === 'COMPLETED') {
        setBannerType('COURSE_COMPLETED');
      } else if (res?.progressPercentage === 100) {
        // Lessons are 100% complete, but course requires passing assessments before completion
        setBannerType('ASSESSMENTS_PENDING');
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

  const handleDownload = async (resource) => {
    try {
      setDownloadingId(resource.id);
      setDownloadError(null);
      await downloadResourceFile(
        courseId,
        resource.id,
        resource.originalFilename || `${resource.title}.pdf`,
      );
    } catch (err) {
      setDownloadError(err.message || 'Failed to download file.');
    } finally {
      setDownloadingId(null);
    }
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

        {/* Course Assessments Navigation (Member 3 Coordination) */}
        {assessments.length > 0 && (
          <div
            className="sidebar-assessments-section"
            style={{
              marginTop: '1.25rem',
              borderTop: '1px solid #e2e8f0',
              paddingTop: '1rem',
              paddingLeft: '0.75rem',
              paddingRight: '0.75rem',
            }}
          >
            <h4
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#64748b',
                marginBottom: '0.5rem',
              }}
            >
              Assessments & Quizzes ({assessments.length})
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {assessments.map((assessment, idx) => (
                <li key={assessment.id}>
                  <Link
                    to={
                      isTrainee && enrollment
                        ? `/courses/${courseId}/assessments/${assessment.id}/player`
                        : `/courses/${courseId}/assessments/manage`
                    }
                    className="sidebar-lesson-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      textDecoration: 'none',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      color: '#1e293b',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <span className="lesson-badge-num" style={{ minWidth: '24px' }}>Q{idx + 1}</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {assessment.title}
                      </span>
                    </span>
                    {assessment.isRequired && (
                      <span
                        style={{
                          fontSize: '0.625rem',
                          background: '#fef3c7',
                          color: '#92400e',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        Required
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Course Feedback Link (Member 3 Coordination) */}
        <div
          className="sidebar-feedback-section"
          style={{
            marginTop: '1rem',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '0.75rem',
            paddingLeft: '0.75rem',
            paddingRight: '0.75rem',
          }}
        >
          <Link
            to={`/courses/${courseId}/feedback`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8125rem',
              color: '#0284c7',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            ★ Course Reviews & Feedback →
          </Link>
        </div>
      </aside>

      {/* Main Lesson Stage */}
      <main className="viewer-main-content" tabIndex="-1">
        {/* Full Course Completion Celebration Banner */}
        {bannerType === 'COURSE_COMPLETED' && (
          <div className="completion-banner" role="status" aria-live="polite">
            <div className="banner-icon" aria-hidden="true">🎉</div>
            <div className="banner-text">
              <h3>Congratulations! Course Completed!</h3>
              <p>You have completed all lessons and satisfied all requirements for <strong>{course?.title}</strong>!</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link to="/my-learning" className="btn btn-sm btn-primary">
                View My Learning
              </Link>
              <Link to="/certificates" className="btn btn-sm btn-secondary">
                View Certificate
              </Link>
            </div>
          </div>
        )}

        {/* Lessons Completed but Required Assessments Pending Banner */}
        {bannerType === 'ASSESSMENTS_PENDING' && (
          <div
            className="completion-banner"
            role="status"
            aria-live="polite"
            style={{
              background: '#fef3c7',
              borderColor: '#f59e0b',
              color: '#92400e',
            }}
          >
            <div className="banner-icon" aria-hidden="true">📝</div>
            <div className="banner-text">
              <h3 style={{ color: '#92400e' }}>All Lessons Completed!</h3>
              <p style={{ color: '#78350f' }}>
                Great work! To complete this course and earn your certificate, please complete the required course assessment(s).
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link
                to={`/courses/${courseId}`}
                className="btn btn-sm btn-primary"
                style={{ background: '#b45309', borderColor: '#b45309', color: '#ffffff' }}
              >
                Go to Assessments →
              </Link>
            </div>
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
            <h2 id="resources-heading">Study Materials & Attached Resources</h2>
            {downloadError && (
              <div className="form-alert alert-error" role="alert">
                <span className="alert-icon" aria-hidden="true">⚠️</span>
                <div className="alert-body">{downloadError}</div>
              </div>
            )}
            <ul className="resource-list">
              {resources
                .filter(
                  (res) =>
                    !res.lessonId || String(res.lessonId) === String(currentLesson.id),
                )
                .map((resource) => {
                  const icon =
                    resource.resourceType === 'VIDEO'
                      ? '🎥'
                      : resource.resourceType === 'PRESENTATION'
                      ? '📊'
                      : resource.resourceType === 'LINK'
                      ? '🔗'
                      : '📄';

                  return (
                    <li key={resource.id} className="resource-item">
                      <span className="resource-icon" aria-hidden="true">{icon}</span>
                      <div className="resource-info">
                        <span className="resource-title">{resource.title}</span>
                        <div className="resource-meta-tags">
                          <span className="resource-type-badge">
                            {resource.resourceType || 'DOCUMENT'}
                          </span>
                          {resource.fileSizeBytes && (
                            <span className="resource-size-tag">
                              {(resource.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                          {resource.lessonId && (
                            <span className="resource-lesson-tag">This Lesson</span>
                          )}
                        </div>
                      </div>

                      {resource.externalUrl ? (
                        <a
                          href={resource.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-secondary"
                        >
                          Visit Link ↗
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={downloadingId === resource.id}
                          onClick={() => handleDownload(resource)}
                        >
                          {downloadingId === resource.id ? 'Downloading...' : 'Download File'}
                        </button>
                      )}
                    </li>
                  );
                })}
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