import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getCourseById, enrollInCourse, getMyEnrollments } from './coursesApi.js';
import { listAssessmentsByCourse } from '../assessments/assessmentsApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
import UiIcon from '../../components/UiIcon.jsx';

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const isTrainee = user?.role === 'TRAINEE';
  const isTrainer = user?.role === 'TRAINER';
  const isAdmin = user?.role === 'ADMIN';

  const [course, setCourse] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
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

  const loadAssessments = useCallback(async () => {
    if (!courseId || !isAuthenticated) {
      setAssessments([]);
      return;
    }
    // Trainees only have access if enrolled; trainers/admins have course-level access
    if (isTrainee && !enrollment) {
      setAssessments([]);
      return;
    }
    setAssessmentsLoading(true);
    try {
      const data = await listAssessmentsByCourse(courseId);
      const items = Array.isArray(data) ? data : (data?.items || []);
      setAssessments(items);
    } catch {
      setAssessments([]);
    } finally {
      setAssessmentsLoading(false);
    }
  }, [courseId, isAuthenticated, isTrainee, enrollment]);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

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
      try {
        const data = await listAssessmentsByCourse(courseId);
        setAssessments(Array.isArray(data) ? data : (data?.items || []));
      } catch {
        // ignore
      }
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
                        <span className="courses-lesson-duration ui-inline">
                          <UiIcon name="clock" size={14} />
                          {lesson.estimatedDurationMinutes} mins
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
                <p className="ui-inline">
                  {isTrainee && !enrollment ? (
                    <>
                      <UiIcon name="lock" size={15} />
                      Enroll in this course to access the ordered lessons and learning resources.
                    </>
                  ) : (
                    'No lessons published yet for this course.'
                  )}
                </p>
              </div>
            )}
          </section>

          {/* Assessments & Quizzes Section (Member 3) */}
          <section className="courses-section" aria-labelledby="assessments-heading">
            <div className="courses-section-header">
              <h2 id="assessments-heading">Assessments & Quizzes</h2>
              <span className="courses-section-count">
                {assessments.length} {assessments.length === 1 ? 'assessment' : 'assessments'}
              </span>
            </div>

            {assessmentsLoading ? (
              <p className="courses-loading-text">Loading assessments...</p>
            ) : assessments.length > 0 ? (
              <ul className="courses-lessons-list" aria-label="Course assessments">
                {assessments.map((assessment, idx) => (
                  <li key={assessment.id} className="courses-lesson-item">
                    <span className="courses-lesson-number" aria-hidden="true">
                      Q{idx + 1}
                    </span>
                    <div className="courses-lesson-info">
                      <h3 className="courses-lesson-title">
                        {assessment.title}
                        {assessment.isRequired && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: '#fef3c7',
                              color: '#92400e',
                              fontWeight: 600,
                            }}
                          >
                            Required for Certificate
                          </span>
                        )}
                      </h3>
                      <span className="courses-lesson-duration">
                        Passing score: {assessment.passPercentage ?? assessment.passingScore}%
                        {assessment.durationMinutes || assessment.timeLimitMinutes ? (
                          <span className="ui-inline" style={{ marginLeft: '0.45rem' }}>
                            <UiIcon name="clock" size={13} />
                            {assessment.durationMinutes || assessment.timeLimitMinutes} mins
                          </span>
                        ) : (
                          ' • No time limit'
                        )}
                      </span>
                    </div>

                    {isTrainee && enrollment ? (
                      <Link
                        to={`/courses/${course.id}/assessments/${assessment.id}/player`}
                        className="courses-btn courses-btn-primary courses-btn-sm"
                        aria-label={`Take quiz: ${assessment.title}`}
                      >
                        Take Quiz →
                      </Link>
                    ) : isOwnerOrAdmin ? (
                      <Link
                        to={`/courses/${course.id}/assessments/manage`}
                        className="courses-btn courses-btn-secondary courses-btn-sm"
                      >
                        Edit in Builder
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="courses-curriculum-locked">
                <p className="ui-inline">
                  {isTrainee && !enrollment ? (
                    <>
                      <UiIcon name="lock" size={15} />
                      Enroll in this course to access assessments and quizzes.
                    </>
                  ) : (
                    'No published assessments for this course yet.'
                  )}
                </p>
              </div>
            )}
          </section>

          {/* Course Feedback & Reviews Section (Member 3) */}
          <section className="courses-section" aria-labelledby="feedback-heading">
            <div className="courses-section-header">
              <h2 id="feedback-heading">Course Feedback & Reviews</h2>
            </div>
            <div className="courses-prose">
              <p>
                Share your learning experience or check reviews from fellow trainees.
              </p>
              <div style={{ marginTop: '12px' }}>
                <Link
                  to={`/courses/${course.id}/feedback`}
                  className="courses-btn courses-btn-secondary courses-btn-sm"
                >
                  {enrollment ? 'Leave or View Feedback →' : 'View Course Reviews →'}
                </Link>
              </div>
            </div>
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
                <div className="courses-banner courses-banner-success ui-inline" role="status">
                  <UiIcon name="check-circle" size={16} />
                  <span>
                    Successfully enrolled in <strong>{course.title}</strong>!
                  </span>
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
                      <span className="courses-badge-enrolled ui-inline">
                        <UiIcon name="check" size={14} />
                        Enrolled
                      </span>
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
                    <Link
                      to={`/courses/${course.id}/feedback`}
                      className="courses-btn courses-btn-secondary courses-btn-block"
                      style={{ marginTop: '8px' }}
                    >
                      Rate & Review Course
                    </Link>
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
                  <Link
                    to={`/courses/${course.id}/assessments/manage`}
                    className="courses-btn courses-btn-secondary courses-btn-block"
                  >
                    Manage Assessments
                  </Link>
                  <Link
                    to={`/courses/${course.id}/assessments/results`}
                    className="courses-btn courses-btn-secondary courses-btn-block"
                  >
                    Assessment Results
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
