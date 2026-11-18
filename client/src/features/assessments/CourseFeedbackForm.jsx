import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCourseFeedback, upsertCourseFeedback } from './assessmentsApi.js';
import UiIcon from '../../components/UiIcon.jsx';
import './assessments.css';

const RATING_LABELS = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

/**
 * CourseFeedbackForm component (Member 3 Trainee UI).
 * Allows enrolled trainees to submit or update 1–5 star ratings
 * and reviews, and view privacy-safe feedback and aggregate ratings.
 */
export default function CourseFeedbackForm() {
  const { courseId } = useParams();

  // Reviews state
  const [reviewsData, setReviewsData] = useState({
    items: [],
    summary: { averageRating: null, totalRatings: 0 },
    pagination: { page: 1, pageSize: 20, total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form input state
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(null);
  const [formError, setFormError] = useState(null);

  const fetchFeedback = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCourseFeedback(courseId, { page: 1, pageSize: 20 });
      setReviewsData(data || { items: [], summary: { averageRating: null, totalRatings: 0 } });
    } catch (err) {
      setError(err.message || 'Unable to load course feedback.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  async function handleSubmitFeedback(e) {
    e.preventDefault();
    if (!courseId || submitting) return;

    if (!rating || rating < 1 || rating > 5) {
      setFormError('Please select a star rating between 1 and 5.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      await upsertCourseFeedback(courseId, {
        rating: Number(rating),
        comment: comment.trim() || null,
      });

      setFormSuccess('Thank you! Your course feedback has been recorded successfully.');
      setComment('');
      // Refresh list and aggregates
      await fetchFeedback();
    } catch (err) {
      setFormError(err.message || 'Failed to submit feedback. Ensure you are enrolled in this course.');
    } finally {
      setSubmitting(false);
    }
  }

  const { items = [], summary = {} } = reviewsData;
  const avgRating = summary.averageRating != null ? Number(summary.averageRating).toFixed(1) : null;
  const totalRatings = Number(summary.totalRatings || 0);

  return (
    <div className="assessment-container">
      {/* Page Header */}
      <div className="assessment-page-header">
        <div className="assessment-header-info">
          <span className="assessment-badge badge-published">Course Evaluation & Review</span>
          <h1>Trainee Course Feedback</h1>
          <p>
            Ratings and qualitative feedback for <strong>Course #{courseId}</strong>
          </p>
        </div>
        <div className="assessment-nav-actions">
          <Link to="/" className="btn btn-secondary">
            ← Back to Portal
          </Link>
        </div>
      </div>

      {error && (
        <div className="scorecard-hero hero-failed" style={{ marginBottom: '1.5rem' }}>
          <div className="scorecard-hero-icon" aria-hidden="true">
            <UiIcon name="alert-triangle" size={32} />
          </div>
          <div className="scorecard-hero-body">
            <h3>Notice</h3>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Aggregate Rating Summary Card */}
      <div className="assessment-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', color: '#0f172a' }}>
              Overall Course Rating
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
              Aggregated from verified enrolled trainee submissions
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
              {avgRating ? `${avgRating}` : '—'}
              <span style={{ fontSize: '1.25rem', color: '#64748b', fontWeight: 500 }}> / 5</span>
            </div>
            <div>
              <div style={{ display: 'flex', gap: '0.2rem', color: '#f59e0b' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <UiIcon
                    key={star}
                    name="star"
                    size={20}
                    filled={Boolean(avgRating && star <= Math.round(Number(avgRating)))}
                  />
                ))}
              </div>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                {totalRatings} {totalRatings === 1 ? 'Review' : 'Reviews'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Trainee Feedback Submission Form */}
      <div className="assessment-card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>Rate & Review This Course</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          Share your experience regarding instructional quality, resources, and assessments.
          If you have previously submitted a review, submitting again will update your entry.
        </p>

        {formSuccess && (
          <div className="scorecard-hero hero-passed" style={{ marginBottom: '1.25rem' }}>
            <div className="scorecard-hero-icon" aria-hidden="true">
              <UiIcon name="check-circle" size={30} />
            </div>
            <div className="scorecard-hero-body">
              <h3>Success</h3>
              <p>{formSuccess}</p>
            </div>
          </div>
        )}

        {formError && (
          <div className="scorecard-hero hero-failed" style={{ marginBottom: '1.25rem' }}>
            <div className="scorecard-hero-icon" aria-hidden="true">
              <UiIcon name="alert-triangle" size={30} />
            </div>
            <div className="scorecard-hero-body">
              <h3>Submission Error</h3>
              <p>{formError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitFeedback}>
          {/* Interactive Star Picker */}
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155' }}>
              Your Star Rating:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{ display: 'flex', gap: '0.25rem', cursor: 'pointer' }}
                onMouseLeave={() => setHoverRating(0)}
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const activeStar = hoverRating ? star <= hoverRating : star <= rating;
                  return (
                    <button
                      key={star}
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: activeStar ? '#f59e0b' : '#cbd5e1',
                        display: 'inline-flex',
                        alignItems: 'center',
                        transition: 'transform 0.1s ease',
                      }}
                      onMouseEnter={() => setHoverRating(star)}
                      onClick={() => setRating(star)}
                      aria-label={`Rate ${star} stars`}
                    >
                      <UiIcon name="star" size={26} filled={activeStar} />
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#475569', marginLeft: '0.5rem' }}>
                {RATING_LABELS[hoverRating || rating]} ({hoverRating || rating}/5)
              </span>
            </div>
          </div>

          {/* Feedback Comment */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label htmlFor="feedback-comment" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, color: '#334155' }}>
              Your Review (Optional):
            </label>
            <textarea
              id="feedback-comment"
              rows={4}
              className="form-control"
              placeholder="What did you think of the course content, difficulty, and hands-on exercises?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
              {comment.length} / 1000 characters
            </div>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <button
              type="submit"
              className="btn btn-primary ui-inline"
              disabled={submitting}
              style={{ padding: '0.6rem 1.75rem', fontSize: '0.95rem' }}
            >
              {!submitting && <UiIcon name="star" size={16} filled />}
              {submitting ? 'Submitting Review...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>

      {/* Community Reviews Feed */}
      <div className="assessment-card">
        <h3 style={{ margin: '0 0 1rem', color: '#0f172a' }}>
          Trainee Reviews ({items.length})
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 0.5rem' }} />
            <p>Loading course reviews...</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px dashed #cbd5e1' }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>
              No reviews have been submitted yet. Be the first enrolled trainee to leave feedback!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.map((rev) => (
              <div
                key={rev.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  background: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: '#e0f2fe',
                        color: '#0369a1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                      }}
                    >
                      {(rev.reviewerName || 'T')[0].toUpperCase()}
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>
                        {rev.reviewerName || 'Verified Trainee'}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>
                        {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.15rem', color: '#f59e0b' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <UiIcon
                        key={star}
                        name="star"
                        size={16}
                        filled={star <= Number(rev.rating)}
                      />
                    ))}
                  </div>
                </div>

                {rev.comment && (
                  <p style={{ margin: '0.5rem 0 0', color: '#334155', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    {rev.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
