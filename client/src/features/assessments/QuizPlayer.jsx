import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getAssessmentById,
  startAttempt,
  getAttemptById,
  submitAttempt,
  listMyAttempts,
} from './assessmentsApi.js';
import ScorecardModal from './ScorecardModal.jsx';
import UiIcon from '../../components/UiIcon.jsx';
import {
  formatTimeAllowedLabel,
  resolveInitialRemainingSeconds,
  resolveResumedQuestions,
  shouldRenderCountdown,
} from './assessmentHelpers.js';
import './assessments.css';

function formatTimer(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * QuizPlayer component (Member 3 Trainee UI).
 * Provides the interactive quiz experience: instructions screen,
 * live countdown timer with auto-submit, question navigator,
 * radio selection, and instant graded scorecard.
 */
export default function QuizPlayer() {
  const { courseId: routeCourseId, assessmentId } = useParams();

  // Core metadata state
  const [assessment, setAssessment] = useState(null);
  const [previousAttempts, setPreviousAttempts] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [initialError, setInitialError] = useState(null);

  // Active quiz session state
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [questionId]: 'A' | 'B' | 'C' | 'D' }
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Graded scorecard state
  const [gradedResult, setGradedResult] = useState(null);
  const [showScorecard, setShowScorecard] = useState(false);

  const timerRef = useRef(null);
  const answersRef = useRef(userAnswers);
  answersRef.current = userAnswers;

  // ─── 1. Load Assessment Meta & Previous Attempts ───
  const loadAssessmentMeta = useCallback(async () => {
    if (!assessmentId) return;
    setLoadingInitial(true);
    setInitialError(null);
    try {
      const [metaRes, myAttemptsRes] = await Promise.all([
        getAssessmentById(assessmentId),
        listMyAttempts({ assessmentId }).catch(() => ({ items: [] })),
      ]);

      const assessData = metaRes?.assessment || metaRes;
      setAssessment(assessData);

      const attemptsList = myAttemptsRes?.items || [];
      setPreviousAttempts(attemptsList);

      // Check if an attempt is currently IN_PROGRESS
      const activeAttempt = attemptsList.find((att) => att.status === 'IN_PROGRESS');
      if (activeAttempt) {
        // Resume active attempt
        const resumeRes = await getAttemptById(activeAttempt.id);
        if (resumeRes?.attempt?.status === 'IN_PROGRESS') {
          setAttempt(resumeRes.attempt);
          setRemainingSeconds(
            resolveInitialRemainingSeconds({
              serverRemainingSeconds: resumeRes.remainingSeconds,
              durationMinutes: assessData?.durationMinutes,
            }),
          );
          const resumedQuestions = resolveResumedQuestions({
            resumeQuestions: resumeRes.questions,
            assessmentQuestions: metaRes?.questions,
          });
          if (resumedQuestions.length > 0) {
            setQuestions(resumedQuestions);
          }
        } else if (resumeRes?.attempt) {
          setPreviousAttempts((prev) =>
            prev.map((item) =>
              item.id === resumeRes.attempt.id ? resumeRes.attempt : item,
            ),
          );
        }
      }
    } catch (err) {
      setInitialError(err.message || 'Unable to load assessment details.');
    } finally {
      setLoadingInitial(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadAssessmentMeta();
  }, [loadAssessmentMeta]);

  // ─── 2. Timer Countdown Hook ───
  useEffect(() => {
    if (remainingSeconds === null || !attempt || attempt.status !== 'IN_PROGRESS') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (remainingSeconds <= 0) {
      // Auto-submit when timer expires
      handleAutoSubmitOnExpiry();
      return;
    }

    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev == null || prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmitOnExpiry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [attempt?.id, remainingSeconds !== null]);

  // ─── 3. Start Assessment Attempt ───
  async function handleStartAttempt() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await startAttempt(assessmentId);
      setAttempt(res.attempt);
      setQuestions(res.questions || []);
      setCurrentQIndex(0);
      setUserAnswers({});
      setRemainingSeconds(
        resolveInitialRemainingSeconds({
          serverRemainingSeconds: res.attempt?.remainingSeconds,
          durationMinutes: assessment?.durationMinutes,
        }),
      );
    } catch (err) {
      setSubmitError(err.message || 'Failed to start assessment attempt.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── 4. Answer Selection ───
  function handleSelectOption(questionId, optionKey) {
    setUserAnswers((prev) => ({
      ...prev,
      [String(questionId)]: optionKey,
    }));
  }

  function handleClearOption(questionId) {
    setUserAnswers((prev) => {
      const copy = { ...prev };
      delete copy[String(questionId)];
      return copy;
    });
  }

  // ─── 5. Submit Answers ───
  const submitAnswersPayload = useCallback(async (isAuto = false) => {
    if (!attempt || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setShowConfirmModal(false);

    try {
      const formattedAnswers = Object.entries(answersRef.current).map(([qId, selectedOption]) => ({
        questionId: qId,
        selectedOption,
      }));

      const res = await submitAttempt(attempt.id, { answers: formattedAnswers });
      setAttempt(res.attempt);
      setGradedResult(res);
      setShowScorecard(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err) {
      setSubmitError(
        isAuto
          ? 'Time expired. Failed to save auto-submission: ' + (err.message || 'Server error.')
          : err.message || 'Failed to submit assessment.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [attempt, submitting]);

  function handleAutoSubmitOnExpiry() {
    if (attempt && attempt.status === 'IN_PROGRESS' && !submitting) {
      submitAnswersPayload(true);
    }
  }

  function handleManualSubmitClick() {
    setShowConfirmModal(true);
  }

  function handleRetakeFromScorecard() {
    setShowScorecard(false);
    setGradedResult(null);
    setAttempt(null);
    setQuestions([]);
    setRemainingSeconds(null);
    handleStartAttempt();
  }

  const effectiveCourseId = routeCourseId || assessment?.courseId;

  // ─── RENDER: Initial Loading & Error ───
  if (loadingInitial) {
    return (
      <div className="assessment-container">
        <div className="assessment-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          <p>Loading assessment environment...</p>
        </div>
      </div>
    );
  }

  if (initialError || !assessment) {
    return (
      <div className="assessment-container">
        <div className="assessment-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2 style={{ color: '#ef4444' }}>Unable to Open Assessment</h2>
          <p>{initialError || 'The requested assessment could not be found.'}</p>
          <div style={{ marginTop: '1.5rem' }}>
            <Link to="/" className="btn btn-secondary">
              ← Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isQuizActive = attempt && attempt.status === 'IN_PROGRESS' && questions.length > 0;
  const currentQuestion = questions[currentQIndex];
  const answeredCount = Object.keys(userAnswers).length;
  const totalCount = questions.length;
  const maxAttempts = Number(assessment.maxAttempts || 1);
  const attemptsUsed = previousAttempts.length;
  const attemptsLeft = Math.max(0, maxAttempts - attemptsUsed);

  // ─── RENDER: Instructions / Pre-Quiz Screen ───
  if (!isQuizActive) {
    return (
      <div className="assessment-container">
        <div className="assessment-page-header">
          <div className="assessment-header-info">
            <span className="assessment-badge badge-published">
              {assessment.isRequired ? 'Mandatory Evaluation' : 'Practice Assessment'}
            </span>
            <h1>{assessment.title}</h1>
            <p>
              Course: <strong>{assessment.courseTitle || `Course #${effectiveCourseId}`}</strong>
            </p>
          </div>
          <div className="assessment-nav-actions">
            <Link to="/" className="btn btn-secondary">
              ← Back to Portal
            </Link>
          </div>
        </div>

        {submitError && (
          <div className="scorecard-hero hero-failed" style={{ marginBottom: '1.5rem' }}>
            <div className="scorecard-hero-icon" aria-hidden="true">
              <UiIcon name="alert-triangle" size={30} />
            </div>
            <div className="scorecard-hero-body">
              <h3>Action Notice</h3>
              <p>{submitError}</p>
            </div>
          </div>
        )}

        <div className="assessment-card">
          <h2>Assessment Overview & Guidelines</h2>
          <p style={{ color: '#475569', fontSize: '0.95rem' }}>
            {assessment.description ||
              'This assessment evaluates your subject comprehension. Please read the evaluation guidelines carefully before beginning.'}
          </p>

          <div className="scorecard-kpi-grid" style={{ marginTop: '1.25rem' }}>
            <div className="scorecard-kpi-card">
              <span className="scorecard-kpi-label">Time Allowed</span>
              <span className="scorecard-kpi-value">
                {formatTimeAllowedLabel(assessment.durationMinutes)}
              </span>
              <span className="scorecard-kpi-subtext">
                {assessment.durationMinutes ? 'Continuous timer' : 'No time limit'}
              </span>
            </div>
            <div className="scorecard-kpi-card">
              <span className="scorecard-kpi-label">Passing Score</span>
              <span className="scorecard-kpi-value">{assessment.passPercentage}%</span>
              <span className="scorecard-kpi-subtext">Required to clear</span>
            </div>
            <div className="scorecard-kpi-card">
              <span className="scorecard-kpi-label">Attempts Allowed</span>
              <span className="scorecard-kpi-value">{maxAttempts}</span>
              <span className="scorecard-kpi-subtext">{attemptsLeft} remaining</span>
            </div>
            <div className="scorecard-kpi-card">
              <span className="scorecard-kpi-label">Total Questions</span>
              <span className="scorecard-kpi-value">{assessment.totalQuestions || '—'}</span>
              <span className="scorecard-kpi-subtext">MCQ Single-Choice</span>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>Important Rules:</h4>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#475569', fontSize: '0.9rem', lineHeight: '1.5' }}>
              {assessment.durationMinutes ? (
                <>
                  <li>The timer begins the moment you click <strong>Start Assessment</strong> and cannot be paused.</li>
                  <li>When the countdown timer expires, your recorded selections are submitted automatically.</li>
                </>
              ) : (
                <li>This assessment is untimed; take your time reviewing questions and submit when ready.</li>
              )}
              <li>You may jump between questions freely using the question navigator strip.</li>
              <li>Your scorecard with detailed answers and explanations will appear immediately upon submission.</li>
            </ul>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary ui-inline"
              style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
              onClick={handleStartAttempt}
              disabled={submitting || (attemptsLeft === 0 && !attempt)}
            >
              {submitting ? (
                'Preparing Attempt...'
              ) : attemptsLeft === 0 ? (
                'No Attempts Remaining'
              ) : (
                <>
                  <UiIcon name="play" size={16} />
                  Start Assessment Now
                </>
              )}
            </button>

            {effectiveCourseId && (
              <Link to={`/courses/${effectiveCourseId}/feedback`} className="btn btn-secondary ui-inline">
                <UiIcon name="star" size={15} filled />
                Course Feedback
              </Link>
            )}
          </div>
        </div>

        {/* Previous Attempts History */}
        {previousAttempts.length > 0 && (
          <div className="assessment-card" style={{ marginTop: '1.5rem' }}>
            <h3>Your Previous Attempts</h3>
            <div className="results-table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Attempt #</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Result</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {previousAttempts.map((att) => (
                    <tr key={att.id}>
                      <td><strong>Attempt {att.attemptNumber}</strong></td>
                      <td>
                        <span className={`assessment-badge ${att.status === 'GRADED' ? 'badge-published' : 'badge-draft'}`}>
                          {att.status}
                        </span>
                      </td>
                      <td>
                        {att.scorePercentage != null ? `${att.scorePercentage}% (${att.earnedPoints}/${att.totalPoints})` : '—'}
                      </td>
                      <td>
                        {att.isPassed != null ? (
                          <span className={`assessment-badge ${att.isPassed ? 'badge-passed' : 'badge-failed'}`}>
                            {att.isPassed ? 'PASSED' : 'FAILED'}
                          </span>
                        ) : '—'}
                      </td>
                      <td>{att.submittedAt ? new Date(att.submittedAt).toLocaleDateString() : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={async () => {
                            try {
                              const detail = await getAttemptById(att.id);
                              setGradedResult(detail);
                              setShowScorecard(true);
                            } catch (e) {
                              alert(e.message || 'Failed to fetch scorecard');
                            }
                          }}
                        >
                          View Scorecard
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Scorecard Modal */}
        <ScorecardModal
          isOpen={showScorecard}
          onClose={() => setShowScorecard(false)}
          result={gradedResult}
          assessment={assessment}
          courseId={effectiveCourseId}
          onRetake={attemptsLeft > 0 ? handleRetakeFromScorecard : null}
        />
      </div>
    );
  }

  // ─── RENDER: Active In-Progress Quiz Player ───
  const hasTimer = shouldRenderCountdown(remainingSeconds);
  const isTimerCritical = hasTimer && remainingSeconds <= 30;
  const isTimerWarning = hasTimer && remainingSeconds <= 120 && !isTimerCritical;

  let timerClass = 'quiz-timer-pill';
  if (isTimerCritical) timerClass += ' timer-critical';
  else if (isTimerWarning) timerClass += ' timer-warning';

  return (
    <div className="assessment-container quiz-player-container">
      {/* Quiz Player Header with Sticky Countdown Timer */}
      <div className="quiz-player-header">
        <div className="quiz-header-left">
          <span className="quiz-kicker">Capsera Assessment Engine</span>
          <h2 className="quiz-title">{assessment.title}</h2>
          <span className="quiz-progress-label">
            Answered {answeredCount} of {totalCount} Questions
          </span>
        </div>

        <div className="quiz-header-right">
          {hasTimer && (
            <div className={timerClass} role="timer" aria-live="polite">
              <span className="timer-icon ui-inline" aria-hidden="true">
                <UiIcon name="clock" size={16} />
              </span>
              <span className="timer-digits">{formatTimer(remainingSeconds)}</span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-success"
            onClick={handleManualSubmitClick}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Finish & Submit'}
          </button>
        </div>
      </div>

      {submitError && (
        <div className="scorecard-hero hero-failed" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <div className="scorecard-hero-icon" aria-hidden="true">
            <UiIcon name="alert-triangle" size={30} />
          </div>
          <div className="scorecard-hero-body">
            <h3>Submission Notice</h3>
            <p>{submitError}</p>
          </div>
        </div>
      )}

      {/* Question Navigator Chips */}
      <nav className="question-nav-strip" aria-label="Question Navigation">
        {questions.map((q, idx) => {
          const isAnswered = Boolean(userAnswers[String(q.id)]);
          const isCurrent = idx === currentQIndex;

          let chipClass = 'question-nav-chip';
          if (isCurrent) chipClass += ' chip-current';
          else if (isAnswered) chipClass += ' chip-answered';
          else chipClass += ' chip-unanswered';

          return (
            <button
              key={q.id || idx}
              type="button"
              className={chipClass}
              onClick={() => setCurrentQIndex(idx)}
              aria-label={`Go to Question ${idx + 1}${isAnswered ? ', answered' : ''}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </nav>

      {/* Active Question Card */}
      {currentQuestion && (
        <div className="quiz-question-card">
          <div className="quiz-q-meta-bar">
            <span className="quiz-q-counter">
              Question <strong>{currentQIndex + 1}</strong> of {totalCount}
            </span>
            <span className="quiz-q-points">
              {currentQuestion.points ?? 1} {currentQuestion.points === 1 ? 'Point' : 'Points'}
            </span>
          </div>

          <h3 className="quiz-q-text">{currentQuestion.questionText}</h3>

          {/* Multiple-Choice Radio Options */}
          <div className="quiz-options-group" role="radiogroup" aria-labelledby="question-text">
            {[
              { key: 'A', text: currentQuestion.optionA },
              { key: 'B', text: currentQuestion.optionB },
              { key: 'C', text: currentQuestion.optionC },
              { key: 'D', text: currentQuestion.optionD },
            ]
              .filter((opt) => Boolean(opt.text))
              .map((opt) => {
                const isSelected = userAnswers[String(currentQuestion.id)] === opt.key;
                return (
                  <label
                    key={opt.key}
                    className={`option-select-card ${isSelected ? 'option-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`question_${currentQuestion.id}`}
                      value={opt.key}
                      checked={isSelected}
                      onChange={() => handleSelectOption(currentQuestion.id, opt.key)}
                      className="option-radio-input"
                    />
                    <span className="option-badge-circle">{opt.key}</span>
                    <span className="option-label-text">{opt.text}</span>
                  </label>
                );
              })}
          </div>

          {/* Question Bottom Action Toolbar */}
          <div className="quiz-q-actions">
            <div>
              {userAnswers[String(currentQuestion.id)] && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleClearOption(currentQuestion.id)}
                >
                  Clear Selection
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentQIndex === 0}
              >
                ← Previous
              </button>

              {currentQIndex < totalCount - 1 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setCurrentQIndex((prev) => Math.min(totalCount - 1, prev + 1))}
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleManualSubmitClick}
                  disabled={submitting}
                >
                  Review & Submit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="assessment-modal-overlay" role="dialog" aria-modal="true">
          <div className="assessment-modal" style={{ maxWidth: '480px' }}>
            <div className="assessment-modal-header">
              <h2>Confirm Assessment Submission</h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowConfirmModal(false)}
                aria-label="Close confirmation dialog"
              >
                <UiIcon name="x" size={15} />
              </button>
            </div>

            <p style={{ color: '#334155', fontSize: '0.95rem' }}>
              You have answered <strong>{answeredCount}</strong> of <strong>{totalCount}</strong> questions.
            </p>

            {answeredCount < totalCount && (
              <div className="ui-inline" style={{ display: 'flex', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.375rem', padding: '0.75rem', color: '#92400e', fontSize: '0.875rem', marginBottom: '1rem' }}>
                <UiIcon name="alert-triangle" size={16} />
                <span>
                  You still have <strong>{totalCount - answeredCount} unanswered</strong> questions. Unanswered questions will receive 0 points.
                </span>
              </div>
            )}

            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
              Once submitted, your answers will be automatically graded and the attempt will be finalized.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
              >
                Continue Quiz
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={() => submitAnswersPayload(false)}
                disabled={submitting}
              >
                {submitting ? 'Grading...' : 'Yes, Submit Answers'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Graded Scorecard Modal */}
      <ScorecardModal
        isOpen={showScorecard}
        onClose={() => setShowScorecard(false)}
        result={gradedResult}
        assessment={assessment}
        courseId={effectiveCourseId}
        onRetake={attemptsLeft > 0 ? handleRetakeFromScorecard : null}
      />
    </div>
  );
}
