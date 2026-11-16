import React, { useEffect, useId, useState } from 'react';
import AnnouncementForm from './AnnouncementForm.jsx';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATUSES,
  createAnnouncement,
  listAdminAnnouncements,
  updateAnnouncement,
} from './announcementsApi.js';
import './announcements.css';

const PAGE_SIZE = 20;

const CATEGORY_LABELS = Object.fromEntries(
  ANNOUNCEMENT_CATEGORIES.map((item) => [item.value, item.label]),
);

const STATUS_CLASS_NAMES = {
  DRAFT: 'announcement-badge-status-draft',
  PUBLISHED: 'announcement-badge-status-published',
  ARCHIVED: 'announcement-badge-status-archived',
};

function formatDateTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/**
 * Admin Announcements Management page (`ACTIVE` `ADMIN` role).
 * Authentication/authorization is enforced on the backend; this component relies
 * on shared frontend auth headers/session configured via `apiClient.js`.
 */
export default function AdminAnnouncementsPage() {
  const statusFilterId = useId();
  const formHeadingId = useId();
  const listHeadingId = useId();

  const [statusFilter, setStatusFilter] = useState('');
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
  const [loadError, setLoadError] = useState(null);

  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setLoadError(null);

    listAdminAnnouncements(
      {
        status: statusFilter || undefined,
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
      .catch((error) => {
        if (!active || error.name === 'AbortError') return;
        setLoadError(error.message || 'Failed to load announcements.');
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [statusFilter, page, refreshTick]);

  async function handleFormSubmit(payload) {
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      if (editingAnnouncement) {
        const updated = await updateAnnouncement(editingAnnouncement.id, payload);
        setEditingAnnouncement(null);
        setSuccessMessage(`Updated announcement "${updated.title}".`);
      } else {
        const created = await createAnnouncement(payload);
        setSuccessMessage(
          created.status === 'PUBLISHED'
            ? `Published announcement "${created.title}".`
            : `Saved draft "${created.title}".`,
        );
        setPage(1);
      }
      setRefreshTick((tick) => tick + 1);
      return true;
    } catch (error) {
      setFormError(error.message || 'Could not save announcement.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePublishDraft(item) {
    if (isSubmitting) return;
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const updated = await updateAnnouncement(item.id, { status: 'PUBLISHED' });
      if (editingAnnouncement?.id === item.id) {
        setEditingAnnouncement(null);
      }
      setSuccessMessage(`Published "${updated.title}".`);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setActionError(error.message || 'Failed to publish announcement.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmArchive(item) {
    if (isSubmitting) return;
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const updated = await updateAnnouncement(item.id, { status: 'ARCHIVED' });
      if (editingAnnouncement?.id === item.id) {
        setEditingAnnouncement(null);
      }
      setConfirmArchiveId(null);
      setSuccessMessage(`Archived "${updated.title}".`);
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setActionError(error.message || 'Failed to archive announcement.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalPages = pagination.totalPages ?? 0;
  const totalItems = pagination.totalItems ?? 0;

  return (
    <main className="announcements-page">
      <header className="announcements-page-header">
        <h1>Manage Announcements</h1>
        <p className="announcements-subtitle">
          Create drafts, publish announcements to the homepage, edit active posts, or archive old
          announcements.
        </p>
      </header>

      {successMessage && (
        <div className="announcements-banner announcements-banner-success" role="status">
          <span>{successMessage}</span>
        </div>
      )}

      {actionError && (
        <div className="announcements-banner announcements-banner-error" role="alert">
          <span>{actionError}</span>
        </div>
      )}

      <section className="announcements-card" aria-labelledby={formHeadingId}>
        <h2 id={formHeadingId} className="announcements-title">
          {editingAnnouncement
            ? `Edit Announcement: ${editingAnnouncement.title}`
            : 'Create Announcement'}
        </h2>
        <p className="announcements-subtitle">
          {editingAnnouncement
            ? 'Update fields below. Archived announcements cannot be edited or restored.'
            : 'Save as a draft or publish immediately to the public homepage feed.'}
        </p>

        <AnnouncementForm
          editingAnnouncement={editingAnnouncement}
          isSubmitting={isSubmitting}
          serverError={formError}
          onSubmit={handleFormSubmit}
          onCancelEdit={() => {
            setEditingAnnouncement(null);
            setFormError(null);
          }}
        />
      </section>

      <section className="announcements-card" aria-labelledby={listHeadingId}>
        <div className="announcements-section-header">
          <div>
            <h2 id={listHeadingId} className="announcements-title">
              All Announcements ({totalItems})
            </h2>
            <p className="announcements-subtitle">
              Includes drafts, published posts, expired posts, and archived posts.
            </p>
          </div>

          <div className="announcements-filters">
            <div className="announcements-field">
              <label className="announcements-label" htmlFor={statusFilterId}>
                Filter by Status
              </label>
              <select
                id={statusFilterId}
                className="announcements-select"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                {ANNOUNCEMENT_STATUSES.map((item) => (
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

        {!isLoading && loadError && (
          <div className="announcements-banner announcements-banner-error" role="alert">
            <span>{loadError}</span>
            <button
              type="button"
              className="announcements-btn announcements-btn-secondary"
              onClick={() => setRefreshTick((tick) => tick + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !loadError && items.length === 0 && (
          <div className="announcements-empty">
            <p>No announcements match the selected filter.</p>
          </div>
        )}

        {!isLoading && !loadError && items.length > 0 && (
          <>
            <div className="announcements-list">
              {items.map((item) => {
                const isArchived = item.status === 'ARCHIVED';
                const isDraft = item.status === 'DRAFT';

                return (
                  <article key={String(item.id)} className="announcement-card">
                    <div className="announcement-card-top">
                      <h3 className="announcement-card-title">{item.title}</h3>
                      <div className="announcement-badges">
                        <span className="announcement-badge announcement-badge-category">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                        <span
                          className={`announcement-badge ${
                            STATUS_CLASS_NAMES[item.status] || ''
                          }`.trim()}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>

                    <p className="announcement-meta">
                      Published: {formatDateTime(item.publishedAt)}
                      {item.expiresAt ? ` • Expires: ${formatDateTime(item.expiresAt)}` : ''}
                      {item.creatorName ? ` • By ${item.creatorName}` : ''}
                    </p>
                    <p className="announcement-body">{item.body}</p>

                    <div className="announcement-actions">
                      {isArchived ? (
                        <span className="announcement-readonly-note">
                          Archived announcements are permanent and cannot be edited or restored.
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="announcements-btn announcements-btn-secondary"
                            disabled={isSubmitting}
                            onClick={() => {
                              setEditingAnnouncement(item);
                              setFormError(null);
                              setConfirmArchiveId(null);
                            }}
                          >
                            Edit
                          </button>

                          {isDraft && (
                            <button
                              type="button"
                              className="announcements-btn announcements-btn-primary"
                              disabled={isSubmitting}
                              onClick={() => handlePublishDraft(item)}
                            >
                              Publish
                            </button>
                          )}

                          <button
                            type="button"
                            className="announcements-btn announcements-btn-danger-outline"
                            disabled={isSubmitting}
                            onClick={() => setConfirmArchiveId(item.id)}
                          >
                            Archive
                          </button>
                        </>
                      )}
                    </div>

                    {confirmArchiveId === item.id && !isArchived && (
                      <div className="announcements-confirm-box" role="region" aria-label="Confirm archive">
                        <p className="announcements-confirm-text">
                          Archive &ldquo;{item.title}&rdquo;? It will be hidden from the public
                          homepage and cannot be restored later.
                        </p>
                        <div className="announcements-form-actions">
                          <button
                            type="button"
                            className="announcements-btn announcements-btn-danger"
                            disabled={isSubmitting}
                            onClick={() => handleConfirmArchive(item)}
                          >
                            {isSubmitting ? 'Archiving...' : 'Confirm Archive'}
                          </button>
                          <button
                            type="button"
                            className="announcements-btn announcements-btn-secondary"
                            disabled={isSubmitting}
                            onClick={() => setConfirmArchiveId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <nav className="announcements-pagination" aria-label="Admin announcements pagination">
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
    </main>
  );
}
