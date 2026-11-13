import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTrainerRecommendations, listAllSkills } from './competencyApi.js';
import './competency.css';

const PAGE_SIZE = 20;

function formatProficiencyLabel(label) {
  if (!label) return 'Unknown';
  const normalized = String(label).trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatYearsOfExperience(years) {
  const numeric = Number(years);
  if (!Number.isFinite(numeric)) return '0 years';
  return `${numeric} ${numeric === 1 ? 'year' : 'years'}`;
}

function formatApiError(error, fallbackMessage) {
  if (error?.status === 401 || error?.code === 'UNAUTHENTICATED') {
    return 'Authentication required. Sign in with an active Trainee or Admin account to view trainer recommendations.';
  }
  if (error?.code === 'FORBIDDEN') {
    return 'Access denied. Trainer recommendations are available only to active Trainee and Admin users.';
  }
  return error?.message || fallbackMessage;
}

/**
 * Deterministic, explainable Trainer Recommendations page (`TRAINEE` or `ADMIN` role).
 *
 * Loads the complete canonical skill catalogue via `listAllSkills()`, lets the user select
 * a skill, fetches ranked active trainer matches from `GET /api/v1/trainers/recommendations`,
 * and displays results in the exact deterministic order returned by the server.
 *
 * @param {object} [props]
 * @param {string | null} [props.coursesPath=null] - Optional registered route path for published courses
 */
export default function TrainerRecommendationsPage({ coursesPath = null } = {}) {
  const skillSelectId = useId();
  const selectorHeadingId = useId();
  const resultsHeadingId = useId();
  const skillSelectRef = useRef(null);
  const skillsRequestIdRef = useRef(0);
  const recRequestIdRef = useRef(0);

  // Canonical skill catalogue state
  const [skills, setSkills] = useState([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(true);
  const [skillsError, setSkillsError] = useState(null);
  const [skillsRefreshTick, setSkillsRefreshTick] = useState(0);

  // Selected skill + recommendation query state
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [page, setPage] = useState(1);
  const [recRefreshTick, setRecRefreshTick] = useState(0);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [recError, setRecError] = useState(null);
  const [recommendationData, setRecommendationData] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++skillsRequestIdRef.current;
    let active = true;

    setIsLoadingSkills(true);
    setSkillsError(null);

    listAllSkills({ signal: controller.signal })
      .then((allSkills) => {
        if (!active || requestId !== skillsRequestIdRef.current) return;
        setSkills(Array.isArray(allSkills) ? allSkills : []);
        setIsLoadingSkills(false);
      })
      .catch((error) => {
        if (!active || requestId !== skillsRequestIdRef.current || error.name === 'AbortError') {
          return;
        }
        setSkillsError(formatApiError(error, 'Failed to load canonical skill catalogue.'));
        setIsLoadingSkills(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [skillsRefreshTick]);

  useEffect(() => {
    if (!selectedSkillId) {
      recRequestIdRef.current += 1;
      setIsLoadingRecs(false);
      setRecError(null);
      setRecommendationData(null);
      return undefined;
    }

    const controller = new AbortController();
    const requestId = ++recRequestIdRef.current;
    let active = true;

    setIsLoadingRecs(true);
    setRecError(null);

    getTrainerRecommendations(
      {
        skillId: selectedSkillId,
        page,
        pageSize: PAGE_SIZE,
      },
      { signal: controller.signal },
    )
      .then((data) => {
        if (!active || requestId !== recRequestIdRef.current) return;
        setRecommendationData(data ?? null);
        setIsLoadingRecs(false);
      })
      .catch((error) => {
        if (!active || requestId !== recRequestIdRef.current || error.name === 'AbortError') {
          return;
        }
        setRecommendationData(null);
        setRecError(formatApiError(error, 'Failed to load trainer recommendations.'));
        setIsLoadingRecs(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedSkillId, page, recRefreshTick]);

  const selectedSkillSummary = useMemo(
    () => skills.find((skill) => String(skill.id) === selectedSkillId) ?? null,
    [skills, selectedSkillId],
  );

  function handleSkillChange(event) {
    const nextSkillId = event.target.value;
    setSelectedSkillId(nextSkillId);
    setPage(1);
    setRecError(null);
    setRecommendationData(null);
  }

  function handleClearSelectionAndFocus() {
    setSelectedSkillId('');
    setPage(1);
    setRecError(null);
    setRecommendationData(null);
    skillSelectRef.current?.focus();
  }

  const matchedSkill = recommendationData?.skill ?? selectedSkillSummary;
  const items = recommendationData?.items ?? [];
  const pagination = recommendationData?.pagination ?? {
    page,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  };
  const totalItems = pagination.totalItems ?? 0;
  const totalPages = pagination.totalPages ?? 0;
  const currentPage = pagination.page ?? page;
  const currentPageSize = pagination.pageSize ?? PAGE_SIZE;

  const validCoursesPath =
    typeof coursesPath === 'string' && coursesPath.trim().startsWith('/')
      ? coursesPath.trim()
      : null;

  return (
    <main className="competency-page">
      <header className="competency-page-header">
        <h1>Trainer Recommendations</h1>
        <p className="competency-subtitle">
          Find active trainers matched deterministically by canonical skill, declared proficiency,
          and skill-specific years of experience.
        </p>
      </header>

      <div className="competency-banner competency-banner-info" role="note">
        Recommendations are based on trainers&apos; self-declared competency profiles and
        skill-specific experience. Self-declared information is not independently verified and does
        not guarantee trainer quality.
      </div>

      <section className="competency-card" aria-labelledby={selectorHeadingId}>
        <div className="competency-card-header">
          <div>
            <h2 id={selectorHeadingId} className="competency-title">
              Select a Canonical Skill
            </h2>
            <p className="competency-subtitle">
              Choose a skill from the canonical catalogue to view matching active trainers.
            </p>
          </div>
        </div>

        {isLoadingSkills && (
          <p className="competency-subtitle" role="status" aria-live="polite">
            Loading canonical skill catalogue...
          </p>
        )}

        {skillsError && (
          <div className="competency-banner competency-banner-error" role="alert">
            <span>{skillsError}</span>
            <button
              type="button"
              className="competency-btn competency-btn-secondary competency-retry-btn"
              onClick={() => setSkillsRefreshTick((tick) => tick + 1)}
            >
              Retry Loading Skills
            </button>
          </div>
        )}

        {!isLoadingSkills && !skillsError && skills.length === 0 && (
          <div className="competency-empty-state">
            <p>No canonical skills are available in the catalogue yet.</p>
          </div>
        )}

        {!isLoadingSkills && !skillsError && skills.length > 0 && (
          <div className="competency-recommendation-controls">
            <div className="competency-field competency-recommendation-select-field">
              <label className="competency-label" htmlFor={skillSelectId}>
                Canonical Skill
              </label>
              <select
                ref={skillSelectRef}
                id={skillSelectId}
                className="competency-select"
                value={selectedSkillId}
                onChange={handleSkillChange}
              >
                <option value="">Select a skill to view recommendations</option>
                {skills.map((skill) => (
                  <option key={String(skill.id)} value={String(skill.id)}>
                    {skill.name} ({skill.category})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>

      {selectedSkillId && (
        <section className="competency-card" aria-labelledby={resultsHeadingId}>
          <div className="competency-card-header">
            <div>
              <h2 id={resultsHeadingId} className="competency-title">
                {matchedSkill
                  ? `Recommended Trainers for ${matchedSkill.name}`
                  : 'Recommended Trainers'}
              </h2>
              {(matchedSkill?.category || (!isLoadingRecs && !recError && recommendationData)) && (
                <p className="competency-subtitle">
                  {matchedSkill?.category ? `Category: ${matchedSkill.category}` : null}
                  {!isLoadingRecs && !recError && recommendationData
                    ? `${matchedSkill?.category ? ' • ' : ''}${totalItems} matching ${
                        totalItems === 1 ? 'trainer' : 'trainers'
                      }`
                    : null}
                </p>
              )}
            </div>
          </div>

          {isLoadingRecs && (
            <p className="competency-subtitle" role="status" aria-live="polite">
              Loading trainer recommendations...
            </p>
          )}

          {!isLoadingRecs && recError && (
            <div className="competency-banner competency-banner-error" role="alert">
              <span>{recError}</span>
              <button
                type="button"
                className="competency-btn competency-btn-secondary competency-retry-btn"
                onClick={() => setRecRefreshTick((tick) => tick + 1)}
              >
                Retry
              </button>
            </div>
          )}

          {!isLoadingRecs && !recError && recommendationData && items.length === 0 && (
            <div className="competency-empty-state">
              <p className="competency-empty-title">
                No active trainers currently match{' '}
                <strong>{matchedSkill?.name || 'this skill'}</strong>.
              </p>
              <p className="competency-subtitle">
                You can try another skill or explore published courses to build this competency.
              </p>
              <div className="competency-empty-actions">
                {validCoursesPath ? (
                  <Link className="competency-btn competency-btn-primary" to={validCoursesPath}>
                    Browse Published Courses
                  </Link>
                ) : (
                  <p className="competency-empty-note">
                    Published course navigation will link directly once course catalogue routing is
                    registered in the application.
                  </p>
                )}
                <button
                  type="button"
                  className="competency-btn competency-btn-secondary"
                  onClick={handleClearSelectionAndFocus}
                >
                  Choose Another Skill
                </button>
              </div>
            </div>
          )}

          {!isLoadingRecs && !recError && items.length > 0 && (
            <>
              <ol className="competency-recommendation-list">
                {items.map((trainer, index) => {
                  const rank = (currentPage - 1) * currentPageSize + index + 1;
                  const proficiencyLabel = formatProficiencyLabel(trainer.proficiencyLabel);
                  const experienceText = formatYearsOfExperience(trainer.yearsOfExperience);
                  const matchedSkillLabel =
                    trainer.explanation?.matchedSkill || matchedSkill?.name || 'Matched Skill';

                  return (
                    <li
                      key={String(trainer.trainerId)}
                      className="competency-recommendation-card"
                    >
                      <div className="competency-recommendation-top">
                        <div className="competency-recommendation-identity">
                          <span
                            className="competency-recommendation-rank"
                            aria-label={`Rank ${rank}`}
                          >
                            #{rank}
                          </span>
                          <div>
                            <h3 className="competency-recommendation-name">{trainer.fullName}</h3>
                            {(trainer.headline || trainer.organization) && (
                              <p className="competency-recommendation-meta">
                                {[trainer.headline, trainer.organization]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="competency-recommendation-skill-pill">
                          {matchedSkillLabel}
                        </span>
                      </div>

                      <dl className="competency-recommendation-metrics">
                        <div className="competency-recommendation-metric">
                          <dt>Declared Proficiency</dt>
                          <dd>
                            Level {trainer.proficiency} ({proficiencyLabel})
                          </dd>
                        </div>
                        <div className="competency-recommendation-metric">
                          <dt>Skill Experience</dt>
                          <dd>{experienceText}</dd>
                        </div>
                        <div className="competency-recommendation-metric">
                          <dt>Matched Skill</dt>
                          <dd>{matchedSkillLabel}</dd>
                        </div>
                      </dl>

                      {trainer.explanation?.summary && (
                        <p className="competency-recommendation-explanation">
                          <strong>Match explanation:</strong> {trainer.explanation.summary}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>

              <nav
                className="competency-pagination"
                aria-label="Trainer recommendations pagination"
              >
                <button
                  type="button"
                  className="competency-btn competency-btn-secondary"
                  disabled={currentPage <= 1 || isLoadingRecs}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="competency-pagination-info">
                  Page {currentPage} of {Math.max(1, totalPages)} ({totalItems} total)
                </span>
                <button
                  type="button"
                  className="competency-btn competency-btn-secondary"
                  disabled={totalPages === 0 || currentPage >= totalPages || isLoadingRecs}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </section>
      )}
    </main>
  );
}