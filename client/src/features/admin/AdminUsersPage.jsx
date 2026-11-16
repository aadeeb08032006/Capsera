 import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiRequest } from '../../services/apiClient.js';

const DEFAULT_PAGE_SIZE = 20;

function getRequestErrorMessage(error) {
  if (error.status === 403) return error.message || 'You are not authorized to manage users.';
  if (error.status === 404) return 'This user could not be found. The list has been refreshed.';
  if (error.status === 409) return error.message || 'This user can no longer be changed in that way.';
  return error.message || 'The request could not be completed.';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [busyUserId, setBusyUserId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) query.set('status', status);
    if (role) query.set('role', role);
    if (debouncedSearch) query.set('search', debouncedSearch);

    setIsLoading(true);
    setLoadError('');
    apiRequest(`/admin/users?${query.toString()}`, { method: 'GET', signal: controller.signal })
      .then((payload) => {
        if (!active) return;
        setItems(payload.data?.items ?? []);
        setPagination(payload.data?.pagination ?? { page, pageSize, totalItems: 0, totalPages: 0 });
      })
      .catch((error) => {
        if (!active || error.name === 'AbortError') return;
        setItems([]);
        setLoadError(getRequestErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [status, role, debouncedSearch, page, pageSize, refreshKey]);

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  async function updateUser(userId, endpoint, body, successText) {
    if (busyUserId !== null) return;
    setBusyUserId(userId);
    setActionError('');
    setSuccessMessage('');
    try {
      await apiRequest(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
      setSuccessMessage(successText);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setActionError(getRequestErrorMessage(error));
      if (error.status === 404) setRefreshKey((key) => key + 1);
    } finally {
      setBusyUserId(null);
    }
  }

  function updateStatus(item, nextStatus, actionLabel) {
    if ((nextStatus === 'REJECTED' || nextStatus === 'SUSPENDED') &&
        !window.confirm(`${actionLabel} ${item.fullName}?`)) return;
    const successVerb = nextStatus === 'REJECTED'
      ? 'rejected'
      : nextStatus === 'SUSPENDED'
        ? 'suspended'
        : item.status === 'SUSPENDED'
          ? 'reactivated'
          : 'approved';
    updateUser(
      item.id,
      `/admin/users/${encodeURIComponent(item.id)}/status`,
      { status: nextStatus },
      `${item.fullName} was ${successVerb}.`,
    );
  }

  function updateRole(item, nextRole) {
    if (!nextRole || nextRole === item.role) return;
    updateUser(
      item.id,
      `/admin/users/${encodeURIComponent(item.id)}/role`,
      { role: nextRole },
      `${item.fullName}'s role was updated.`,
    );
  }

  const totalPages = pagination.totalPages ?? 0;

  return (
    <main className="admin-users-page">
      <header className="page-header">
        <p className="page-eyebrow">Administration</p>
        <h1>Users</h1>
        <p>Review registrations and manage account access.</p>
      </header>

      <section className="users-toolbar" aria-label="User filters">
        <div className="page-field">
          <label htmlFor="users-status">Status</label>
          <select id="users-status" value={status} onChange={(event) => changeFilter(setStatus, event.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All statuses</option>
          </select>
        </div>
        <div className="page-field">
          <label htmlFor="users-role">Role</label>
          <select id="users-role" value={role} onChange={(event) => changeFilter(setRole, event.target.value)}>
            <option value="">All roles</option>
            <option value="TRAINEE">Trainee</option>
            <option value="TRAINER">Trainer</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="page-field users-search">
          <label htmlFor="users-search">Search name or email</label>
          <input id="users-search" type="search" value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} />
        </div>
      </section>

      {successMessage && <p className="page-success" role="status">{successMessage}</p>}
      {actionError && <p className="page-alert" role="alert">{actionError}</p>}
      {loadError && <p className="page-alert" role="alert">{loadError}</p>}

      <section className="users-table-section" aria-label="User results">
        {isLoading ? (
          <p className="page-state" role="status">Loading users…</p>
        ) : loadError ? null : items.length === 0 ? (
          <p className="page-state">No users match these filters.</p>
        ) : (
          <div className="users-table-scroll" tabIndex="0" aria-label="Users table, scroll horizontally on small screens">
            <table className="users-table">
              <thead>
                <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Actions</th></tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isSelf = String(user?.id) === String(item.id);
                  const isBusy = busyUserId !== null;
                  return (
                    <tr key={item.id}>
                      <td>{item.fullName}</td>
                      <td>{item.email}</td>
                      <td>{item.role}</td>
                      <td><span className={`user-status user-status--${item.status.toLowerCase()}`}>{item.status}</span></td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        {isSelf ? <span className="users-self-note">Your account</span> : (
                          <div className="users-row-actions">
                            {item.status === 'PENDING' && (
                              <>
                                <button type="button" className="page-button page-button--small page-button--primary" disabled={isBusy} onClick={() => updateStatus(item, 'ACTIVE', 'Approved')}>Approve</button>
                                <button type="button" className="page-button page-button--small page-button--danger" disabled={isBusy} onClick={() => updateStatus(item, 'REJECTED', 'Reject')}>Reject</button>
                                <label className="visually-hidden" htmlFor={`role-${item.id}`}>Change role for {item.fullName}</label>
                                <select id={`role-${item.id}`} aria-label={`Change role for ${item.fullName}`} value="" disabled={isBusy} onChange={(event) => updateRole(item, event.target.value)}>
                                  <option value="">Change role…</option>
                                  <option value="TRAINEE">Trainee</option>
                                  <option value="TRAINER">Trainer</option>
                                </select>
                              </>
                            )}
                            {item.status === 'ACTIVE' && <button type="button" className="page-button page-button--small page-button--danger" disabled={isBusy} onClick={() => updateStatus(item, 'SUSPENDED', 'Suspend')}>Suspend</button>}
                            {item.status === 'SUSPENDED' && <button type="button" className="page-button page-button--small page-button--primary" disabled={isBusy} onClick={() => updateStatus(item, 'ACTIVE', 'Reactivate')}>Reactivate</button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="users-pagination">
        <p>{pagination.totalItems ?? 0} users</p>
        <div className="users-page-controls">
          <label htmlFor="users-page-size">Rows per page</label>
          <select id="users-page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            <option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option>
          </select>
          <button type="button" className="page-button page-button--small" disabled={isLoading || page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {pagination.page ?? page} of {totalPages}</span>
          <button type="button" className="page-button page-button--small" disabled={isLoading || totalPages === 0 || page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </div>
    </main>
  );
}