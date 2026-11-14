import React, { useEffect, useId, useState } from 'react';
import { createSkill, listSkills } from './competencyApi.js';
import './competency.css';

const PAGE_SIZE = 20;
const MAX_FIELD_LENGTH = 120;

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/**
 * Admin Skills Catalogue Management page (`ADMIN` role).
 * Lists skills with exact-match category filtering and pagination, and supports
 * creating new canonical skills via POST /api/v1/skills.
 */
export default function AdminSkillsPage() {
  const nameInputId = useId();
  const categoryInputId = useId();
  const filterInputId = useId();

  // Catalogue state
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [filterInput, setFilterInput] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Create form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setLoadError(null);

    listSkills(
      {
        category: activeCategory || undefined,
        page,
        pageSize: PAGE_SIZE,
      },
      { signal: controller.signal },
    )
      .then((data) => {
        if (!active) return;
        setItems(data.items ?? []);
        setPagination(
          data.pagination ?? {
            page,
            pageSize: PAGE_SIZE,
            totalItems: 0,
            totalPages: 0,
          },
        );
        setIsLoading(false);
      })
      .catch((error) => {
        if (!active || error.name === 'AbortError') return;
        setLoadError(error.message || 'Failed to load skill catalogue.');
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeCategory, page, refreshTick]);

  function validateCreateForm() {
    const errors = {};
    const trimmedName = name.trim();
    const trimmedCategory = category.trim();

    if (!trimmedName) {
      errors.name = 'Skill name is required.';
    } else if (trimmedName.length > MAX_FIELD_LENGTH) {
      errors.name = `Skill name must be ${MAX_FIELD_LENGTH} characters or fewer.`;
    }

    if (!trimmedCategory) {
      errors.category = 'Category is required.';
    } else if (trimmedCategory.length > MAX_FIELD_LENGTH) {
      errors.category = `Category must be ${MAX_FIELD_LENGTH} characters or fewer.`;
    }

    return { errors, trimmedName, trimmedCategory };
  }

  async function handleCreateSubmit(event) {
    event.preventDefault();
    if (isCreating) return;

    setCreateError(null);
    setCreateSuccess(null);

    const { errors, trimmedName, trimmedCategory } = validateCreateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsCreating(true);
    try {
      const created = await createSkill({
        name: trimmedName,
        category: trimmedCategory,
      });
      setName('');
      setCategory('');
      setFormErrors({});
      setCreateSuccess(`Created skill "${created.name}" in "${created.category}".`);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      if (error.status === 409 || error.code === 'CONFLICT') {
        setCreateError(
          'A skill with this name already exists (skill names are unique case-insensitively).',
        );
      } else {
        setCreateError(error.message || 'Failed to create skill.');
      }
    } finally {
      setIsCreating(false);
    }
  }

  function handleFilterSubmit(event) {
    event.preventDefault();
    const trimmedFilter = filterInput.trim();
    if (trimmedFilter.length > MAX_FIELD_LENGTH) {
      setLoadError(`Category filter must be ${MAX_FIELD_LENGTH} characters or fewer.`);
      return;
    }
    setPage(1);
    setActiveCategory(trimmedFilter);
    setRefreshTick((tick) => tick + 1);
  }

  function handleClearFilter() {
    setFilterInput('');
    setPage(1);
    setActiveCategory('');
  }

  const totalPages = pagination.totalPages ?? 0;
  const totalItems = pagination.totalItems ?? 0;

  return (
    <main className="competency-page">
      <header className="competency-page-header">
        <h1>Skill Catalogue Administration</h1>
        <p className="competency-subtitle">
          Manage the canonical skill catalogue used by trainees, trainers, and recommendations.
        </p>
      </header>

      <section className="competency-card" aria-labelledby="create-skill-heading">
        <h2 id="create-skill-heading" className="competency-title">
          Add Canonical Skill
        </h2>
        <p className="competency-subtitle">
          Skill names are trimmed and enforced as unique regardless of letter case.
        </p>

        {createError && (
          <div className="competency-banner competency-banner-error" role="alert">
            {createError}
          </div>
        )}
        {createSuccess && (
          <div className="competency-banner competency-banner-success" role="status">
            {createSuccess}
          </div>
        )}

        <form className="competency-create-form" onSubmit={handleCreateSubmit} noValidate>
          <div className="competency-field">
            <label className="competency-label" htmlFor={nameInputId}>
              Skill Name
            </label>
            <input
              id={nameInputId}
              type="text"
              maxLength={MAX_FIELD_LENGTH}
              placeholder="e.g. Node.js"
              className={`competency-input ${
                formErrors.name ? 'competency-input-error' : ''
              }`.trim()}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormErrors((prev) => ({ ...prev, name: undefined }));
              }}
              disabled={isCreating}
              required
            />
            {formErrors.name && (
              <p className="competency-field-error" role="alert">
                {formErrors.name}
              </p>
            )}
          </div>

          <div className="competency-field">
            <label className="competency-label" htmlFor={categoryInputId}>
              Category
            </label>
            <input
              id={categoryInputId}
              type="text"
              maxLength={MAX_FIELD_LENGTH}
              placeholder="e.g. Backend"
              className={`competency-input ${
                formErrors.category ? 'competency-input-error' : ''
              }`.trim()}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setFormErrors((prev) => ({ ...prev, category: undefined }));
              }}
              disabled={isCreating}
              required
            />
            {formErrors.category && (
              <p className="competency-field-error" role="alert">
                {formErrors.category}
              </p>
            )}
          </div>

          <div className="competency-add-action">
            <button
              type="submit"
              className="competency-btn competency-btn-primary"
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Skill'}
            </button>
          </div>
        </form>
      </section>

      <section className="competency-card" aria-labelledby="catalogue-heading">
        <div className="competency-card-header">
          <div>
            <h2 id="catalogue-heading" className="competency-title">
              Canonical Skills ({totalItems})
            </h2>
            <p className="competency-subtitle">
              Sorted alphabetically. Category filter uses exact case-sensitive matching.
            </p>
          </div>
        </div>

        <form className="competency-filter-bar" onSubmit={handleFilterSubmit} noValidate>
          <div className="competency-field competency-filter-input">
            <label className="competency-label" htmlFor={filterInputId}>
              Filter by exact category
            </label>
            <input
              id={filterInputId}
              type="text"
              maxLength={MAX_FIELD_LENGTH}
              placeholder="e.g. Backend"
              className="competency-input"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
            />
          </div>
          <div className="competency-filter-actions">
            <button type="submit" className="competency-btn competency-btn-secondary">
              Apply Filter
            </button>
            {activeCategory && (
              <button
                type="button"
                className="competency-btn competency-btn-secondary"
                onClick={handleClearFilter}
              >
                Clear
              </button>
            )}
          </div>
        </form>

        {isLoading && (
          <div className="competency-banner competency-banner-info" role="status">
            Loading skill catalogue...
          </div>
        )}

        {loadError && (
          <div className="competency-banner competency-banner-error" role="alert">
            <span>{loadError}</span>
            <button
              type="button"
              className="competency-btn competency-btn-secondary competency-retry-btn"
              onClick={() => setRefreshTick((tick) => tick + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !loadError && items.length === 0 && (
          <div className="competency-empty-state">
            <p>
              {activeCategory
                ? `No skills found in exact category "${activeCategory}".`
                : 'No skills have been added to the catalogue yet.'}
            </p>
          </div>
        )}

        {!isLoading && !loadError && items.length > 0 && (
          <>
            <div className="competency-table-wrap">
              <table className="competency-table">
                <thead>
                  <tr>
                    <th scope="col">Skill Name</th>
                    <th scope="col">Category</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((skill) => (
                    <tr key={String(skill.id)}>
                      <td data-label="Skill Name" className="competency-cell-skill">
                        {skill.name}
                      </td>
                      <td data-label="Category" className="competency-cell-category">
                        {skill.category}
                      </td>
                      <td data-label="Created">{formatDate(skill.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav className="competency-pagination" aria-label="Skill catalogue pagination">
              <button
                type="button"
                className="competency-btn competency-btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="competency-pagination-info">
                Page {pagination.page} of {Math.max(1, totalPages)} ({totalItems} total)
              </span>
              <button
                type="button"
                className="competency-btn competency-btn-secondary"
                disabled={totalPages === 0 || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
