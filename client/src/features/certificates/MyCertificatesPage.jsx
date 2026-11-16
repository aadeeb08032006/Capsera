import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyCertificates } from './certificatesApi.js';
import './certificates.css';

const PAGE_SIZE = 10;

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/**
 * Trainee "My Certificates" page (`ACTIVE` `TRAINEE` role).
 * Authentication is enforced on the backend; relies on shared session wiring
 * via `apiClient.js`. Read-only: never triggers certificate issuance.
 */
export default function MyCertificatesPage() {
  const headingId = useId();

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

    listMyCertificates({ page, pageSize: PAGE_SIZE }, { signal: controller.signal })
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
        setError(err.message || 'Unable to load your certificates right now.');
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [page, refreshTick]);

  const totalItems = pagination.totalItems ?? 0;
  const totalPages = pagination.totalPages ?? 0;

  return (
    <main className="certificates-page">
      <header className="certificates-page-header">
        <h1 id={headingId}>My Certificates</h1>
        <p className="certificates-subtitle">
          Completion certificates earned after finishing all course lessons and required assessments.
        </p>
      </header>

      <section className="certificates-card" aria-labelledby={headingId}>
        {isLoading && (
          <p className="certificates-status-text" role="status" aria-live="polite">
            Loading your certificates...
          </p>
        )}

        {!isLoading && error && (
          <div className="certificates-banner certificates-banner-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="certificates-btn certificates-btn-secondary"
              onClick={() => setRefreshTick((tick) => tick + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="certificates-empty">
            <p>
              You have not earned any completion certificates yet. Complete all lessons and required
              assessments in an enrolled course to become eligible.
            </p>
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            <div className="certificates-list">
              {items.map((item) => {
                const verifyPath = `/certificates/verify/${encodeURIComponent(item.certificateCode)}`;
                return (
                  <article key={String(item.id)} className="certificate-item-card">
                    <div className="certificate-card-top">
                      <div>
                        <h2 className="certificate-course-title">{item.courseTitle}</h2>
                        {item.courseSubject && (
                          <p className="certificate-course-subject">{item.courseSubject}</p>
                        )}
                      </div>
                      <span
                        className={`certificate-badge ${
                          item.isValid ? 'certificate-badge-valid' : 'certificate-badge-revoked'
                        }`}
                      >
                        {item.isValid ? 'Status: VALID' : 'Status: REVOKED'}
                      </span>
                    </div>

                    <dl className="certificate-details-grid">
                      <div>
                        <dt>Certificate Code</dt>
                        <dd className="certificate-code-inline">{item.certificateCode}</dd>
                      </div>
                      <div>
                        <dt>Issued Date</dt>
                        <dd>{formatDate(item.issuedAt)}</dd>
                      </div>
                    </dl>

                    <div className="certificate-item-actions">
                      <Link to={verifyPath} className="certificates-btn certificates-btn-secondary">
                        Public Verification View
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>

            <nav className="certificates-pagination" aria-label="Certificates pagination">
              <button
                type="button"
                className="certificates-btn certificates-btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="certificates-pagination-info">
                Page {pagination.page} of {Math.max(1, totalPages)} ({totalItems} total)
              </span>
              <button
                type="button"
                className="certificates-btn certificates-btn-secondary"
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

