import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { listCourses } from '../courses/coursesApi.js';
import {
  listAssessmentsByCourse,
  createAssessment,
  updateAssessment,
  publishAssessment,
  deleteAssessment,
  listQuestionsByAssessment,
  createQuestion,
  updateQuestion,
  deleteQuestion,
} from './assessmentsApi.js';
import {
  buildCourseListQueryForRole,
  resolveCourseSelection,
} from './assessmentHelpers.js';
import UiIcon from '../../components/UiIcon.jsx';
import './assessments.css';

export default function TrainerAssessmentBuilder() {
  const { courseId: routeCourseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState(
    routeCourseId ? String(routeCourseId).trim() : '',
  );
  const courseId = resolveCourseSelection({
    routeCourseId,
    selectedCourseId,
  });

  const [ownedCourses, setOwnedCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState(null);

  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(Boolean(courseId));
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Active question bank drawer
  const [activeAssessmentId, setActiveAssessmentId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Modals state
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState(null);
  const [assessmentForm, setAssessmentForm] = useState({
    title: '',
    instructions: '',
    durationMinutes: '',
    deadlineAt: '',
    maxAttempts: 1,
    passPercentage: 60,
    isRequired: true,
  });

  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [questionForm, setQuestionForm] = useState({
    questionText: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctOption: 'A',
    points: 1,
    explanation: '',
    questionOrder: '',
  });

  // Sync courseId state with route parameter changes
  useEffect(() => {
    setSelectedCourseId(routeCourseId ? String(routeCourseId).trim() : '');
    setActiveAssessmentId(null);
    setQuestions([]);
  }, [routeCourseId]);

  // Load owned courses (for TRAINER) or platform courses (for ADMIN)
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadingCourses(true);
    setCoursesError(null);

    listCourses(buildCourseListQueryForRole(user?.role), { signal: controller.signal })
      .then((res) => {
        if (!active) return;
        setOwnedCourses(Array.isArray(res?.items) ? res.items : []);
        setLoadingCourses(false);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setCoursesError(err.message || 'Failed to load courses.');
        setLoadingCourses(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user?.role]);

  // Load assessments for course when a course ID is selected
  useEffect(() => {
    if (!courseId) {
      setAssessments([]);
      setLoading(false);
      setError(null);
      return;
    }
    loadAssessments();
  }, [courseId]);

  async function loadAssessments() {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listAssessmentsByCourse(courseId);
      setAssessments(res.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  }

  function handleCourseSelect(nextCourseId) {
    const normalized = String(nextCourseId || '').trim();
    setSelectedCourseId(normalized);
    setActiveAssessmentId(null);
    setQuestions([]);
    setSuccessMsg(null);
    setError(null);
    if (normalized) {
      navigate(`/courses/${normalized}/assessments/manage`);
    } else {
      navigate('/assessments/manage');
    }
  }

  // Load questions when an assessment is selected
  async function toggleQuestionManager(assessmentId) {
    if (activeAssessmentId === assessmentId) {
      setActiveAssessmentId(null);
      setQuestions([]);
      return;
    }

    setActiveAssessmentId(assessmentId);
    setLoadingQuestions(true);
    setError(null);
    try {
      const items = await listQuestionsByAssessment(assessmentId);
      setQuestions(items || []);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoadingQuestions(false);
    }
  }

  // Assessment Form Handlers
  function openCreateAssessmentModal() {
    setEditingAssessment(null);
    setAssessmentForm({
      title: '',
      instructions: '',
      durationMinutes: '',
      deadlineAt: '',
      maxAttempts: 1,
      passPercentage: 60,
      isRequired: true,
    });
    setShowAssessmentModal(true);
  }

  function openEditAssessmentModal(assessment) {
    setEditingAssessment(assessment);
    setAssessmentForm({
      title: assessment.title || '',
      instructions: assessment.instructions || '',
      durationMinutes: assessment.durationMinutes ?? '',
      deadlineAt: assessment.deadlineAt ? assessment.deadlineAt.substring(0, 16) : '',
      maxAttempts: assessment.maxAttempts ?? 1,
      passPercentage: Number(assessment.passPercentage) || 60,
      isRequired: Boolean(assessment.isRequired),
    });
    setShowAssessmentModal(true);
  }

  async function handleSaveAssessment(e) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        title: assessmentForm.title.trim(),
        instructions: assessmentForm.instructions.trim() || null,
        durationMinutes: assessmentForm.durationMinutes ? Number(assessmentForm.durationMinutes) : null,
        deadlineAt: assessmentForm.deadlineAt ? new Date(assessmentForm.deadlineAt).toISOString() : null,
        maxAttempts: Number(assessmentForm.maxAttempts) || 1,
        passPercentage: Number(assessmentForm.passPercentage) || 60,
        isRequired: Boolean(assessmentForm.isRequired),
      };

      if (editingAssessment) {
        await updateAssessment(editingAssessment.id, payload);
        setSuccessMsg(`Assessment "${payload.title}" updated successfully.`);
      } else {
        await createAssessment(courseId, payload);
        setSuccessMsg(`Assessment "${payload.title}" created successfully.`);
      }

      setShowAssessmentModal(false);
      loadAssessments();
    } catch (err) {
      setError(err.message || 'Failed to save assessment');
    }
  }

  async function handlePublishAssessment(assessmentId) {
    if (!window.confirm('Are you sure you want to publish this assessment? It will become visible to enrolled trainees.')) {
      return;
    }
    setError(null);
    try {
      await publishAssessment(assessmentId);
      setSuccessMsg('Assessment published successfully!');
      loadAssessments();
    } catch (err) {
      if (err.code === 'ASSESSMENT_EMPTY') {
        setError('Cannot publish an empty assessment: please add at least 1 question with points > 0.');
      } else {
        setError(err.message || 'Failed to publish assessment');
      }
    }
  }

  async function handleDeleteAssessment(assessmentId) {
    if (!window.confirm('Are you sure you want to delete this assessment? This cannot be undone.')) {
      return;
    }
    setError(null);
    try {
      await deleteAssessment(assessmentId);
      setSuccessMsg('Assessment deleted successfully.');
      if (activeAssessmentId === assessmentId) {
        setActiveAssessmentId(null);
      }
      loadAssessments();
    } catch (err) {
      if (err.code === 'ASSESSMENT_LOCKED') {
        setError('Cannot delete this assessment because student attempts have already been recorded.');
      } else {
        setError(err.message || 'Failed to delete assessment');
      }
    }
  }

  // Question Form Handlers
  function openCreateQuestionModal() {
    setEditingQuestion(null);
    setQuestionForm({
      questionText: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctOption: 'A',
      points: 1,
      explanation: '',
      questionOrder: '',
    });
    setShowQuestionModal(true);
  }

  function openEditQuestionModal(q) {
    setEditingQuestion(q);
    setQuestionForm({
      questionText: q.questionText || '',
      optionA: q.optionA || '',
      optionB: q.optionB || '',
      optionC: q.optionC || '',
      optionD: q.optionD || '',
      correctOption: q.correctOption || 'A',
      points: q.points ?? 1,
      explanation: q.explanation || '',
      questionOrder: q.questionOrder ?? '',
    });
    setShowQuestionModal(true);
  }

  async function handleSaveQuestion(e) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        questionText: questionForm.questionText.trim(),
        optionA: questionForm.optionA.trim(),
        optionB: questionForm.optionB.trim(),
        optionC: questionForm.optionC.trim(),
        optionD: questionForm.optionD.trim(),
        correctOption: questionForm.correctOption,
        points: Number(questionForm.points) || 1,
        explanation: questionForm.explanation.trim() || null,
        ...(questionForm.questionOrder ? { questionOrder: Number(questionForm.questionOrder) } : {}),
      };

      if (editingQuestion) {
        await updateQuestion(activeAssessmentId, editingQuestion.id, payload);
        setSuccessMsg('Question updated successfully.');
      } else {
        await createQuestion(activeAssessmentId, payload);
        setSuccessMsg('Question added to assessment.');
      }

      setShowQuestionModal(false);
      // Reload questions & assessments to update counts
      const updatedQ = await listQuestionsByAssessment(activeAssessmentId);
      setQuestions(updatedQ || []);
      loadAssessments();
    } catch (err) {
      if (err.code === 'ASSESSMENT_LOCKED') {
        setError('Assessment is locked by recorded attempts: scoring fields (points/correct option) cannot be modified.');
      } else {
        setError(err.message || 'Failed to save question');
      }
    }
  }

  async function handleDeleteQuestion(questionId) {
    if (!window.confirm('Are you sure you want to delete this question?')) {
      return;
    }
    setError(null);
    try {
      await deleteQuestion(activeAssessmentId, questionId);
      setSuccessMsg('Question deleted.');
      const updatedQ = await listQuestionsByAssessment(activeAssessmentId);
      setQuestions(updatedQ || []);
      loadAssessments();
    } catch (err) {
      if (err.code === 'ASSESSMENT_LOCKED') {
        setError('Cannot delete questions from an assessment with recorded student attempts.');
      } else {
        setError(err.message || 'Failed to delete question');
      }
    }
  }

  return (
    <div className="assessment-container">
      {/* Page Header */}
      <div className="assessment-page-header">
        <div className="assessment-header-info">
          <h1>Course Assessment & Quiz Builder</h1>
          <p>Author and publish MCQs, manage pass thresholds, and review student evaluations.</p>
        </div>
        <div className="assessment-nav-actions">
          <Link
            to={courseId ? `/courses/${courseId}/assessments/results` : '/assessments/results'}
            className="btn btn-secondary ui-inline"
          >
            <UiIcon name="bar-chart" size={16} />
            View Student Results & Analytics
          </Link>
          <button
            type="button"
            onClick={openCreateAssessmentModal}
            className="btn btn-primary"
            disabled={!courseId}
          >
            + Create New Assessment
          </button>
        </div>
      </div>

      {/* Course Selector Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <label htmlFor="course-selector" style={{ fontWeight: 600, fontSize: '0.9rem', color: '#475569' }}>
          Course:
        </label>
        <select
          id="course-selector"
          value={courseId}
          onChange={(e) => handleCourseSelect(e.target.value)}
          disabled={loadingCourses}
          style={{ minWidth: '260px', maxWidth: '100%', padding: '0.45rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '0.9rem' }}
        >
          <option value="">
            {loadingCourses
              ? 'Loading your courses...'
              : ownedCourses.length === 0
                ? 'No courses available'
                : 'Select a course...'}
          </option>
          {courseId && !ownedCourses.some((c) => String(c.id) === String(courseId)) && (
            <option value={courseId}>Course #{courseId}</option>
          )}
          {ownedCourses.map((course) => (
            <option key={course.id} value={String(course.id)}>
              {course.title} ({course.status}) — #{course.id}
            </option>
          ))}
        </select>
        {courseId && (
          <button type="button" onClick={loadAssessments} className="btn btn-secondary btn-sm ui-inline">
            <UiIcon name="refresh" size={14} />
            Refresh
          </button>
        )}
        <Link to="/trainer/courses" className="btn btn-secondary btn-sm">
          My Courses
        </Link>
      </div>

      {/* Notifications */}
      {coursesError && (
        <div className="assessment-banner assessment-banner-error" role="alert">
          <UiIcon name="alert-triangle" size={17} />
          <span>{coursesError}</span>
        </div>
      )}
      {error && (
        <div className="assessment-banner assessment-banner-error" role="alert">
          <UiIcon name="alert-triangle" size={17} />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="assessment-banner assessment-banner-success" role="status">
          <UiIcon name="check-circle" size={17} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* No Course Selected Prompt */}
      {!courseId && !loading && (
        <div style={{ textAlign: 'center', padding: '3.5rem', background: '#ffffff', borderRadius: '0.75rem', border: '1px dashed #cbd5e1' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>
            {loadingCourses
              ? 'Loading Courses...'
              : ownedCourses.length === 0
                ? 'No Owned Courses Found'
                : 'Select a Course to Manage Assessments'}
          </h3>
          <p style={{ color: '#64748b', margin: '0 0 1.25rem' }}>
            {loadingCourses
              ? 'Fetching the courses assigned to your workspace.'
              : ownedCourses.length === 0
                ? 'Create a course first before authoring quizzes and exams.'
                : 'Choose a course from the Course selector above or navigate from My Courses.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/trainer/courses" className="btn btn-secondary">
              Go to My Courses
            </Link>
            {!loadingCourses && ownedCourses.length === 0 && (
              <Link to="/trainer/courses/new" className="btn btn-primary">
                + Create New Course
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {courseId && loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          Loading course assessments...
        </div>
      )}

      {/* Empty State */}
      {courseId && !loading && !error && assessments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3.5rem', background: '#ffffff', borderRadius: '0.75rem', border: '1px dashed #cbd5e1' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>No Assessments Found</h3>
          <p style={{ color: '#64748b', margin: '0 0 1.25rem' }}>
            There are currently no quizzes or exams created for Course #{courseId}.
          </p>
          <button onClick={openCreateAssessmentModal} className="btn btn-primary">
            Create First Assessment
          </button>
        </div>
      )}

      {/* Assessment Cards List */}
      {!loading && assessments.length > 0 && (
        <div className="assessment-cards-list">
          {assessments.map((assessment) => {
            const isSelected = activeAssessmentId === assessment.id;
            const statusClass =
              assessment.status === 'PUBLISHED'
                ? 'badge-published'
                : assessment.status === 'CLOSED'
                ? 'badge-closed'
                : 'badge-draft';

            return (
              <div key={assessment.id} className="assessment-item-card">
                <div className="assessment-item-header">
                  <h2 className="assessment-item-title">
                    {assessment.title}
                    <span className={`assessment-badge ${statusClass}`}>{assessment.status}</span>
                    {assessment.isRequired && <span className="assessment-badge badge-required">Required</span>}
                  </h2>
                </div>

                <div className="assessment-meta-chips">
                  <span className="ui-inline">
                    <UiIcon name="clock" size={14} />
                    {assessment.durationMinutes ? `${assessment.durationMinutes} mins` : 'No time limit'}
                  </span>
                  <span className="ui-inline">
                    <UiIcon name="calendar" size={14} />
                    {assessment.deadlineAt ? new Date(assessment.deadlineAt).toLocaleString() : 'No deadline'}
                  </span>
                  <span className="ui-inline">
                    <UiIcon name="target" size={14} />
                    Pass mark: {assessment.passPercentage}%
                  </span>
                  <span className="ui-inline">
                    <UiIcon name="refresh" size={14} />
                    Max attempts: {assessment.maxAttempts}
                  </span>
                  <span className="ui-inline">
                    <UiIcon name="help-circle" size={14} />
                    {assessment.questionCount || 0} questions ({assessment.totalPoints || 0} pts)
                  </span>
                </div>

                {assessment.instructions && (
                  <div className="assessment-instructions-preview">
                    {assessment.instructions}
                  </div>
                )}

                <div className="assessment-item-actions">
                  <button
                    onClick={() => toggleQuestionManager(assessment.id)}
                    className="btn btn-secondary btn-sm ui-inline"
                  >
                    <UiIcon name={isSelected ? 'chevron-up' : 'chevron-down'} size={14} />
                    {isSelected ? 'Hide Questions' : `Manage Questions (${assessment.questionCount || 0})`}
                  </button>

                  {assessment.status === 'DRAFT' && (
                    <button
                      onClick={() => handlePublishAssessment(assessment.id)}
                      className="btn btn-success btn-sm"
                    >
                      Publish Quiz
                    </button>
                  )}

                  <button
                    onClick={() => openEditAssessmentModal(assessment)}
                    className="btn btn-secondary btn-sm ui-inline"
                  >
                    <UiIcon name="edit" size={14} />
                    Edit Details
                  </button>

                  <button
                    onClick={() => handleDeleteAssessment(assessment.id)}
                    className="btn btn-outline-danger btn-sm ui-inline"
                  >
                    <UiIcon name="trash" size={14} />
                    Delete
                  </button>
                </div>

                {/* Question Manager Drawer */}
                {isSelected && (
                  <div className="question-manager-card">
                    <div className="question-manager-header">
                      <h3>Question Bank for "{assessment.title}"</h3>
                      <button onClick={openCreateQuestionModal} className="btn btn-primary btn-sm">
                        + Add Question
                      </button>
                    </div>

                    {loadingQuestions && <div style={{ color: '#64748b' }}>Loading questions...</div>}

                    {!loadingQuestions && questions.length === 0 && (
                      <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '0.5rem', textAlign: 'center', color: '#64748b' }}>
                        No questions in this assessment yet. Click <strong>+ Add Question</strong> to add your first MCQ.
                      </div>
                    )}

                    {!loadingQuestions && questions.length > 0 && (
                      <div>
                        {questions.map((q) => (
                          <div key={q.id} className="question-item">
                            <div className="question-item-header">
                              <span className="question-item-title">
                                #{q.questionOrder}. {q.questionText}
                              </span>
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <span className="assessment-badge badge-published">{q.points} pt{q.points > 1 ? 's' : ''}</span>
                                <button onClick={() => openEditQuestionModal(q)} className="btn btn-secondary btn-sm">
                                  Edit
                                </button>
                                <button onClick={() => handleDeleteQuestion(q.id)} className="btn btn-outline-danger btn-sm">
                                  Delete
                                </button>
                              </div>
                            </div>

                            <div className="question-options-grid">
                              <div className={`question-option-box ui-inline ${q.correctOption === 'A' ? 'question-option-correct' : ''}`}>
                                <span>A. {q.optionA}</span>
                                {q.correctOption === 'A' && <UiIcon name="check" size={14} />}
                              </div>
                              <div className={`question-option-box ui-inline ${q.correctOption === 'B' ? 'question-option-correct' : ''}`}>
                                <span>B. {q.optionB}</span>
                                {q.correctOption === 'B' && <UiIcon name="check" size={14} />}
                              </div>
                              <div className={`question-option-box ui-inline ${q.correctOption === 'C' ? 'question-option-correct' : ''}`}>
                                <span>C. {q.optionC}</span>
                                {q.correctOption === 'C' && <UiIcon name="check" size={14} />}
                              </div>
                              <div className={`question-option-box ui-inline ${q.correctOption === 'D' ? 'question-option-correct' : ''}`}>
                                <span>D. {q.optionD}</span>
                                {q.correctOption === 'D' && <UiIcon name="check" size={14} />}
                              </div>
                            </div>

                            {q.explanation && (
                              <div className="question-explanation-box">
                                <strong>Explanation:</strong> {q.explanation}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assessment Create/Edit Modal */}
      {showAssessmentModal && (
        <div className="assessment-modal-backdrop" onClick={() => setShowAssessmentModal(false)}>
          <div className="assessment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="assessment-modal-header">
              <h2>{editingAssessment ? 'Edit Assessment' : 'Create New Assessment'}</h2>
              <button
                type="button"
                onClick={() => setShowAssessmentModal(false)}
                className="btn btn-secondary btn-sm"
                aria-label="Close modal"
              >
                <UiIcon name="x" size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveAssessment}>
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  placeholder="e.g. Synoptic Meteorology Quiz 1"
                  value={assessmentForm.title}
                  onChange={(e) => setAssessmentForm({ ...assessmentForm, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Instructions</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="e.g. Answer all questions within 30 minutes."
                  value={assessmentForm.instructions}
                  onChange={(e) => setAssessmentForm({ ...assessmentForm, instructions: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    placeholder="Leave blank for untimed"
                    value={assessmentForm.durationMinutes}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, durationMinutes: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Passing Score (%) *</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    className="form-control"
                    value={assessmentForm.passPercentage}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, passPercentage: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Max Attempts *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="form-control"
                    value={assessmentForm.maxAttempts}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, maxAttempts: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Submission Deadline</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={assessmentForm.deadlineAt}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, deadlineAt: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-checkbox">
                <input
                  id="isRequired-checkbox"
                  type="checkbox"
                  checked={assessmentForm.isRequired}
                  onChange={(e) => setAssessmentForm({ ...assessmentForm, isRequired: e.target.checked })}
                />
                <label htmlFor="isRequired-checkbox">Required for Course Completion & Certificate</label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAssessmentModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingAssessment ? 'Save Changes' : 'Create Assessment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Question Create/Edit Modal */}
      {showQuestionModal && (
        <div className="assessment-modal-backdrop" onClick={() => setShowQuestionModal(false)}>
          <div className="assessment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="assessment-modal-header">
              <h2>{editingQuestion ? 'Edit MCQ Question' : 'Add MCQ Question'}</h2>
              <button
                type="button"
                onClick={() => setShowQuestionModal(false)}
                className="btn btn-secondary btn-sm"
                aria-label="Close modal"
              >
                <UiIcon name="x" size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion}>
              <div className="form-group">
                <label>Question Text *</label>
                <textarea
                  required
                  rows="3"
                  className="form-control"
                  placeholder="e.g. What physical mechanism causes geostrophic wind balance?"
                  value={questionForm.questionText}
                  onChange={(e) => setQuestionForm({ ...questionForm, questionText: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Option A *</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  value={questionForm.optionA}
                  onChange={(e) => setQuestionForm({ ...questionForm, optionA: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Option B *</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  value={questionForm.optionB}
                  onChange={(e) => setQuestionForm({ ...questionForm, optionB: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Option C *</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  value={questionForm.optionC}
                  onChange={(e) => setQuestionForm({ ...questionForm, optionC: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Option D *</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  value={questionForm.optionD}
                  onChange={(e) => setQuestionForm({ ...questionForm, optionD: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Correct Option *</label>
                  <select
                    className="form-control"
                    value={questionForm.correctOption}
                    onChange={(e) => setQuestionForm({ ...questionForm, correctOption: e.target.value })}
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Points *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="form-control"
                    value={questionForm.points}
                    onChange={(e) => setQuestionForm({ ...questionForm, points: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Explanation (Shown to students after submission)</label>
                <textarea
                  rows="2"
                  className="form-control"
                  placeholder="Explain why this answer is correct..."
                  value={questionForm.explanation}
                  onChange={(e) => setQuestionForm({ ...questionForm, explanation: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowQuestionModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingQuestion ? 'Update Question' : 'Save Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
