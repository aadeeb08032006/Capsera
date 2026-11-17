import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getCourseById, enrollInCourse, getMyEnrollments } from './coursesApi.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isTrainee, isTrainer, isAdmin } = useAuth();

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState(null);
  const [enrollError, setEnrollError] = useState(null);
  const [enrollSuccess, setEnrollSuccess] = useState(false);

  const loadCourseData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const courseData = await getCourseById(courseId);
      setCourse(courseData);

      // Check if logged-in trainee is already enrolled
      if (isAuthenticated && isTrainee) {
        try {
          const myEnrollments = await getMyEnrollments();
          const match = myEnrollments.find(
            (e) => String(e.courseId) === String(courseId) && e.status !== 'CANCELLED',
          );
          if (match) {
            setEnrollment(match);
          }
        } catch {
          // If check fails silently continue
        }
      }
    } catch (err) {
      setError(err.message || 'Course not found or access denied');
    } finally {
      setLoading(false);
    }
  }, [courseId, isAuthenticated, isTrainee]);

  useEffect(() => {
    loadCourseData();
  }, [loadCourseData]);

  const handleEnroll = async () => {
    if (!isAuthenticated) {
      navigate('/courses');
      return;
    }
    setEnrolling(true);
    setEnrollError(null);
    try {
      const newEnrollment = await enrollInCourse(courseId);
      setEnrollment(newEnrollment);
      setEnrollSuccess(true);
      // Reload course to fetch ordered lessons now that trainee is enrolled
      const updatedCourse = await getCourseById(courseId);
      setCourse(updatedCourse);
    } catch (err) {
      if (err.code === 'DUPLICATE_ENROLLMENT' || err.status === 409) {
        setEnrollSuccess(true);
        // Trainee already enrolled, refresh enrollment status
        const myEnrollments = await getMyEnrollments().catch(() => []);
        const match = myEnrollments.find((e) => String(e.courseId) === String(courseId));
        if (match) setEnrollment(match);
      } else {
        setEnrollError(err.message || 'Failed to complete course enrollment');
      }
    } finally {
      setEnrolling(false);
    }
  };

  const isOwnerOrAdmin =
    (isTrainer && course && String(course.trainerId) === String(user?.id)) || isAdmin;

  if (loading) {
    return (
      <main className="courses-page-container">
        <div className="courses-loading-container" role="status" aria-live="polite">
          <div className="courses-spinner" aria-hidden="true" />
          <p>Loading course details...</p>
        </div>
      </main>
    );
  }

  if (error || !course) {
    return (
      <main className="courses-page-container">
        <div className="courses-state-card courses-state-error" role="alert">
          <h2>Unable to Load Course</h2>
          <p>{error || 'The requested course does not exist.'}</p>
          <div className="courses-banner-actions">
            <button
              type="button"
              className="courses-btn courses-btn-secondary"
              onClick={loadCourseData}
            >
              Retry
            </button>
            <Link to="/courses" className="courses-btn courses-btn-primary">
              Return to Catalogue
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const lessons = course.lessons || [];
  const hasLessons = lessons.length > 0;
  const firstLessonId = hasLessons ? lessons[0].id : null;

  return (
    <main className="courses-page-container">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="courses-breadcrumb">
        <ol>
          <li>
            <Link to="/courses">Catalogue</Link>
          </li>
          <li aria-current="page">{course.title}</li>
        </ol>
      </nav>

      <div className="courses-detail-layout">
        {/* Main Course Content */}
        <div className="courses-detail-main">
          <header className="courses-detail-header">
            <div className="courses-detail-meta-top">
              {course.subject && (
                <span className="courses-badge-subject">{course.subject}</span>
              )}
              {course.level && (
                <span className={`courses-badge-level courses-level-${course.level.toLowerCase()}`}>
                  {course.level}
                </span>
              )}
              {course.status && course.status !== 'PUBLISHED' && (
                <span className={`courses-badge-status courses-status-${course.status.toLowerCase()}`}>
                  {course.status}
                </span>
              )}
            </div>

            <h1>{course.title}</h1>

            {course.trainerName && (
              <p className="courses-detail-trainer">
                Instructed by <strong>{course.trainerName}</strong>
              </p>
            )}

            {course.summary && (
              <p className="courses-detail-summary">{course.summary}</p>
            )}
          </header>

          {/* Description Section */}
          <section className="courses-section" aria-labelledby="desc-heading">
            <h2 id="desc-heading">About this Course</h2>
            <div className="courses-prose">
              {course.description ? (
                course.description.split('\n\n').map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))
              ) : (
                <p>No extended syllabus description provided.</p>
              )}
            </div>
          </section>

          {/* Lessons Curriculum List */}
          <section className="courses-section" aria-labelledby="curriculum-heading">
            <div className="courses-section-header">
              <h2 id="curriculum-heading">Course Curriculum</h2>
              <span className="courses-section-count">
                {course.lessonCount ?? lessons.length} lessons
              </span>
            </div>

            {hasLessons ? (
              <ol className="courses-lessons-list" aria-label="Curriculum lessons">
                {lessons.map((lesson) => (
                  <li key={lesson.id} className="courses-lesson-item">
                    <span className="courses-lesson-number" aria-hidden="true">
                      {lesson.position}
                    </span>
                    <div className="courses-lesson-info">
                      <h3 className="courses-lesson-title">
                        {enrollment || isOwnerOrAdmin ? (
                          <Link to={`/courses/${course.id}/lessons/${lesson.id}`}>
                            {lesson.title}
                          </Link>
                        ) : (
                          lesson.title
                        )}
                      </h3>
                      {lesson.estimatedDurationMinutes && (
                        <span className="courses-lesson-duration">
                          ⏱ {lesson.estimatedDurationMinutes} mins
                        </span>
                      )}
                    </div>

                    {(enrollment || isOwnerOrAdmin) && (
                      <Link
                        to={`/courses/${course.id}/lessons/${lesson.id}`}
                        className="courses-btn courses-btn-secondary courses-btn-sm"
                        aria-label={`Open lesson: ${lesson.title}`}
                      >
                        Start Lesson
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="courses-curriculum-locked">
                <p>
                  {isTrainee && !enrollment
                    ? '🔒 Enroll in this course to access the ordered lessons and learning resources.'
                    : 'No lessons published yet for this course.'}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar / Enrollment Action Card */}
        <aside className="courses-detail-sidebar" aria-label="Enrollment Actions">
          <div className="courses-action-card">
            {course.thumbnailUrl && (
              <div className="courses-sidebar-thumbnail">
                <img
                  src={course.thumbnailUrl}
                  alt={`Cover for ${course.title}`}
                />
              </div>
            )}

            <div className="courses-action-card-body">
              {enrollSuccess && (
                <div className="courses-banner courses-banner-success" role="status">
                  ✓ Successfully enrolled in <strong>{course.title}</strong>!
                </div>
              )}

              {enrollError && (
                <div className="courses-banner courses-banner-error" role="alert">
                  {enrollError}
                </div>
              )}

              {/* Action Buttons based on User Role */}
              {isTrainee ? (
                enrollment ? (
                  <div className="courses-enrolled-actions">
                    <div className="courses-enrolled-status">
                      <span className="courses-badge-enrolled">✓ Enrolled</span>
                    </div>
                    {firstLessonId ? (
                      <Link
                        to={`/courses/${course.id}/lessons/${firstLessonId}`}
                        className="courses-btn courses-btn-primary courses-btn-block"
                      >
                        Continue Learning →
                      </Link>
                    ) : (
                      <Link
                        to="/my-learning"
                        className="courses-btn courses-btn-primary courses-btn-block"
                      >
                        View in My Learning
                      </Link>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="courses-btn courses-btn-primary courses-btn-block courses-btn-lg"
                    disabled={enrolling}
                    onClick={handleEnroll}
                    aria-label={`Enroll in course ${course.title}`}
                  >
                    {enrolling ? 'Enrolling...' : 'Enroll in Course'}
                  </button>
                )
              ) : isOwnerOrAdmin ? (
                <div className="courses-trainer-actions">
                  <span className="courses-badge-owner">Course Owner</span>
                  <Link
                    to={`/trainer/courses/${course.id}/edit`}
                    className="courses-btn courses-btn-secondary courses-btn-block"
                  >
                    Edit Course Info
                  </Link>
                  <Link
                    to={`/trainer/courses/${course.id}/lessons`}
                    className="courses-btn courses-btn-primary courses-btn-block"
                  >
                    Manage Lessons
                  </Link>
                </div>
              ) : !isAuthenticated ? (
                <div className="courses-guest-action">
                  <p>Log in as a trainee to enroll and start learning.</p>
                  <a
                    href="/courses"
                    className="courses-btn courses-btn-primary courses-btn-block"
                  >
                    Explore Courses
                  </a>
                </div>
              ) : (
                <p className="courses-role-note">
                  Logged in as <strong>{user?.role}</strong>. Course enrollment is available for Trainees.
                </p>
              )}

              <hr className="courses-divider" />

              <ul className="courses-quick-specs" aria-label="Course highlights">
                <li>
                  <span>Level:</span> <strong>{course.level || 'Not specified'}</strong>
                </li>
                <li>
                  <span>Subject:</span> <strong>{course.subject || 'General'}</strong>
                </li>
                <li>
                  <span>Lessons:</span> <strong>{course.lessonCount ?? lessons.length}</strong>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
