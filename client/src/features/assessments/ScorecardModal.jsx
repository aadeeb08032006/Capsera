import React from 'react';
import { Link } from 'react-router-dom';
import UiIcon from '../../components/UiIcon.jsx';
import './assessments.css';

/**
 * ScorecardModal component (Member 3 Trainee UI).
 * Renders the deterministic auto-grading result after quiz submission,
 * including earned points, percentage, pass/fail status, answer review
 * with correct options & explanations, and course completion celebration banner.
 */
export default function ScorecardModal({
  isOpen,
  onClose,
  result,
  assessment,
  courseId,
  onRetake,
}) {
  if (!isOpen || !result) return null;

  const { attempt, answers = [] } = result;
  const isPassed = Boolean(attempt.isPassed);
  const earnedPoints = Number(attempt.earnedPoints ?? 0);
  const totalPoints = Number(attempt.totalPoints ?? 0);
  const scorePercentage = Number(attempt.scorePercentage ?? 0);
  const passPercentage = Number(assessment?.passPercentage ?? attempt.passPercentage ?? 60);
  const attemptNumber = attempt.attemptNumber ?? 1;
  const maxAttempts = assessment?.maxAttempts ?? attempt.maxAttempts ?? 1;
  const canRetake = !isPassed && attemptNumber < maxAttempts && typeof onRetake === 'function';

  return (
    <div className="assessment-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="scorecard-title">
      <div className="assessment-modal scorecard-modal">
        <div className="assessment-modal-header">
          <h2 id="scorecard-title">Assessment Results & Scorecard</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            aria-label="Close scorecard"
          >
            <UiIcon name="x" size={16} />
          </button>
        </div>

        {/* Hero Result Banner */}
        <div className={`scorecard-hero ${isPassed ? 'hero-passed' : 'hero-failed'}`}>
          <div className="scorecard-hero-icon" aria-hidden="true">
            <UiIcon name={isPassed ? 'check-circle' : 'alert-triangle'} size={34} />
          </div>
          <div className="scorecard-hero-body">
            <h3>{isPassed ? 'Congratulations! You Passed!' : 'Assessment Not Passed'}</h3>
            <p>
              {isPassed
                ? `You have successfully met the passing threshold of ${passPercentage}% for this assessment.`
                : `You scored ${scorePercentage}%. A minimum of ${passPercentage}% is required to pass.`}
            </p>
          </div>
          <div className="scorecard-hero-badge">
            <span className={`assessment-badge ${isPassed ? 'badge-passed' : 'badge-failed'}`}>
              {isPassed ? 'PASSED' : 'FAILED'}
            </span>
          </div>
        </div>

        {/* KPI Score Overview */}
        <div className="scorecard-kpi-grid">
          <div className="scorecard-kpi-card">
            <span className="scorecard-kpi-label">Final Score</span>
            <span className="scorecard-kpi-value">{scorePercentage}%</span>
            <span className="scorecard-kpi-subtext">
              {earnedPoints} / {totalPoints} Points
            </span>
          </div>
          <div className="scorecard-kpi-card">
            <span className="scorecard-kpi-label">Passing Target</span>
            <span className="scorecard-kpi-value">{passPercentage}%</span>
            <span className="scorecard-kpi-subtext">Required to clear</span>
          </div>
          <div className="scorecard-kpi-card">
            <span className="scorecard-kpi-label">Attempt</span>
            <span className="scorecard-kpi-value">
              #{attemptNumber}
            </span>
            <span className="scorecard-kpi-subtext">
              of {maxAttempts} allowed
            </span>
          </div>
          <div className="scorecard-kpi-card">
            <span className="scorecard-kpi-label">Total Questions</span>
            <span className="scorecard-kpi-value">{answers.length}</span>
            <span className="scorecard-kpi-subtext">
              {answers.filter((a) => a.isCorrect).length} Correct
            </span>
          </div>
        </div>

        {/* Course Completion & Certificate Notice (PRD §6.6) */}
        {isPassed && (
          <div className="scorecard-completion-banner">
            <div className="completion-icon" aria-hidden="true">
              <UiIcon name="award" size={30} />
            </div>
            <div>
              <strong>Course Completion Credit Unlocked</strong>
              <p>
                This passing attempt satisfies the assessment requirement for this course. Once all module
                lessons and required quizzes are cleared, your verified completion certificate is generated automatically.
              </p>
              <div style={{ marginTop: '0.4rem' }}>
                <Link to="/certificates/verify" className="scorecard-verify-link">
                  Verify Certificates Registry →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Question Review */}
        <div className="scorecard-review-section">
          <h3 className="scorecard-section-heading">Detailed Question Review</h3>
          <p className="scorecard-section-desc">
            Review your answers, the instructor&apos;s answer keys, and pedagogical explanations.
          </p>

          <div className="scorecard-questions-list">
            {answers.map((ans, idx) => {
              const isCorrect = Boolean(ans.isCorrect);
              return (
                <div
                  key={ans.id || ans.questionId || idx}
                  className={`scorecard-question-item ${isCorrect ? 'item-correct' : 'item-incorrect'}`}
                >
                  <div className="scorecard-q-header">
                    <span className="scorecard-q-num">Question {idx + 1}</span>
                    <span className={`scorecard-q-pill ui-inline ${isCorrect ? 'pill-correct' : 'pill-incorrect'}`}>
                      <UiIcon name={isCorrect ? 'check' : 'x'} size={14} />
                      {isCorrect
                        ? `Correct (+ ${ans.pointsAwarded ?? ans.points} pts)`
                        : 'Incorrect (0 pts)'}
                    </span>
                  </div>

                  <p className="scorecard-q-text">{ans.questionText}</p>

                  <div className="scorecard-options-grid">
                    {[
                      { key: 'A', text: ans.optionA },
                      { key: 'B', text: ans.optionB },
                      { key: 'C', text: ans.optionC },
                      { key: 'D', text: ans.optionD },
                    ].map((opt) => {
                      const isSelected = ans.selectedOption === opt.key;
                      const isTargetCorrect = ans.correctOption === opt.key;

                      let optClass = 'scorecard-opt';
                      if (isTargetCorrect) optClass += ' opt-correct';
                      else if (isSelected && !isCorrect) optClass += ' opt-wrong';

                      return (
                        <div key={opt.key} className={optClass}>
                          <span className="opt-key-badge">{opt.key}</span>
                          <span className="opt-text">{opt.text}</span>
                          {isSelected && <span className="opt-tag tag-selected">Your Answer</span>}
                          {isTargetCorrect && <span className="opt-tag tag-correct">Correct Answer</span>}
                        </div>
                      );
                    })}
                  </div>

                  {ans.explanation && (
                    <div className="scorecard-explanation-box">
                      <strong className="ui-inline">
                        <UiIcon name="lightbulb" size={15} />
                        Instructor Explanation:
                      </strong>
                      <p>{ans.explanation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Controls */}
        <div className="scorecard-footer-actions">
          {canRetake && (
            <button
              type="button"
              className="btn btn-primary ui-inline"
              onClick={onRetake}
            >
              <UiIcon name="refresh" size={15} />
              Retake Assessment ({maxAttempts - attemptNumber} left)
            </button>
          )}

          {courseId && (
            <Link
              to={`/courses/${courseId}/feedback`}
              className="btn btn-secondary ui-inline"
            >
              <UiIcon name="star" size={15} filled />
              Leave Course Feedback
            </Link>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Close Scorecard
          </button>
        </div>
      </div>
    </div>
  );
}
