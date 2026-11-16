import React, { useEffect, useId, useState } from 'react';
import { ANNOUNCEMENT_CATEGORIES, listPublicAnnouncements } from './announcementsApi.js';
import './announcements.css';

const PAGE_SIZE = 5;

const CATEGORY_LABELS = Object.fromEntries(
  ANNOUNCEMENT_CATEGORIES.map((item) => [item.value, item.label]),
);

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/**
 * Public homepage announcements feed showing only published, non-expired posts.
 * No authentication is required.
 */
export default function AnnouncementsFeedSection() {
  const headingId = useId();
  const categorySelectId = useId();

  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setError(null);

    listPublicAnnouncements(
      {
        category: category || undefined,
        page,
        pageSize: PAGE_SIZE,
      },
      { signal: controller.signal },
    )
      .then((data) => {
        if (!active) return;
        setItems(data?.items ?? []);
        setPagination(
          data?.pagination ?? {
            page,
            pageSize: PAGE_SIZE,
            totalItems: 0,
            totalPages: 0,
          },
        );
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setError(err.message || 'Unable to load announcements right now.');
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [category, page, refreshTick]);

  const totalItems = pagination.totalItems ?? 0;
  const totalPages = pagination.totalPages ?? 0;

  return (
    <section className="announcements-section" aria-labelledby={headingId}>
      <div className="announcements-section-header">
        <div>
          <h2 id={headingId} className="announcements-title">
            Announcements
          </h2>
          <p className="announcements-subtitle">
            Platform updates, achievements, and newly added learning content.
          </p>
        </div>

        <div className="announcements-filters">
          <div className="announcements-field">
            <label className="announcements-label" htmlFor={categorySelectId}>
              Category
            </label>
            <select
              id={categorySelectId}
              className="announcements-select"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All Categories</option>
              {ANNOUNCEMENT_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading && (
        <p className="announcements-subtitle" role="status" aria-live="polite">
          Loading announcements...
        </p>
      )}

      {!isLoading && error && (
        <div className="announcements-banner announcements-banner-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="announcements-btn announcements-btn-secondary"
            onClick={() => setRefreshTick((tick) => tick + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="announcements-empty">
          <p>
            {category
              ? `No published posts in "${CATEGORY_LABELS[category] || category}" right now.`
              : 'No published announcements are available right now.'}
          </p>
        </div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <>
          <div className="announcements-list">
            {items.map((item) => (
              <article key={String(item.id)} className="announcement-card">
                <div className="announcement-card-top">
                  <h3 className="announcement-card-title">{item.title}</h3>
                  <span className="announcement-badge announcement-badge-category">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </span>
                </div>
                <p className="announcement-meta">Published {formatDate(item.publishedAt)}</p>
                <p className="announcement-body">{item.body}</p>
              </article>
            ))}
          </div>

          <nav className="announcements-pagination" aria-label="Announcements pagination">
            <button
              type="button"
              className="announcements-btn announcements-btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="announcements-pagination-info">
              Page {pagination.page} of {Math.max(1, totalPages)} ({totalItems} total)
            </span>
            <button
              type="button"
              className="announcements-btn announcements-btn-secondary"
              disabled={totalPages === 0 || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
