import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { listCourses } from './coursesApi.js';
import UiIcon from '../../components/UiIcon.jsx';

export default function TrainerCoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 12;

  const fetchTrainerCourses = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        mine: 'true',
        page: currentPage,
        pageSize,
      };

      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const result = await listCourses(params);
      setCourses(result.items || []);
      setTotalItems(result.totalItems || 0);
    } catch (err) {
      setError(err.message || 'Failed to load your courses. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrainerCourses();
  }, [statusFilter, currentPage]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchTrainerCourses();
  };

  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Compute stats across current items
  const stats = useMemo(() => {
    const total = totalItems || courses.length;
    const published = courses.filter((c) => c.status === 'PUBLISHED').length;
    const drafts = courses.filter((c) => c.status === 'DRAFT').length;
    const archived = courses.filter((c) => c.status === 'ARCHIVED').length;
    return { total, published, drafts, archived };
  }, [courses, totalItems]);

  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  return (
    <main className="courses-page-container">
      {/* Page Header */}
      <header className="trainer-courses-header">
        <div>
          <span className="trainer-badge">Trainer Dashboard</span>
          <h1>My Courses</h1>
          <p className="trainer-subtitle">
            Author, organize, and manage your courses, lessons, and educational resources.
          </p>
        </div>
        <Link to="/trainer/courses/new" className="btn btn-primary btn-lg">
          + Create New Course
        </Link>
      </header>

      {/* Overview Stat Counters */}
      <section className="trainer-stats-grid" aria-label="Course Statistics">
        <div className="stat-card">
          <span className="stat-label">Total Courses</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Published</span>
          <span className="stat-value text-success">{stats.published}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Drafts</span>
          <span className="stat-value text-warning">{stats.drafts}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Archived</span>
          <span className="stat-value text-muted">{stats.archived}</span>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="trainer-filter-bar" aria-label="Course Filters">
        <div className="filter-status-tabs" role="tablist" aria-label="Filter courses by status">
          {['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'].map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={statusFilter === status}
              className={`status-tab-btn ${statusFilter === status ? 'active' : ''}`}
              onClick={() => {
                setStatusFilter(status);
                setCurrentPage(1);
              }}
            >
              {status === 'ALL' ? 'All Courses' : status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="trainer-search-form">
          <input
            type="search"
            className="form-control"
            placeholder="Search by title or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search my courses"
          />
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
      </section>

      {/* Loading State */}
      {loading && (
        <div className="courses-loading-state" aria-busy="true" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>Loading your courses...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="courses-error-state" role="alert">
          <h2>Error Loading Courses</h2>
          <p>{error}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={fetchTrainerCourses}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State: No courses created yet */}
      {!loading && !error && courses.length === 0 && statusFilter === 'ALL' && !searchQuery && (
        <div className="courses-empty-state" role="region" aria-labelledby="empty-trainer-heading">
          <h2 id="empty-trainer-heading">You haven't created any courses yet</h2>
          <p>
            Start sharing your knowledge! Create your first course, add structured lessons, and publish
            when you are ready.
          </p>
          <Link to="/trainer/courses/new" className="btn btn-primary btn-lg">
            + Create Your First Course
          </Link>
        </div>
      )}

      {/* Empty State: Filters returned no results */}
      {!loading && !error && courses.length === 0 && (statusFilter !== 'ALL' || searchQuery) && (
        <div className="courses-empty-state" role="region" aria-labelledby="no-filter-matches-heading">
          <h2 id="no-filter-matches-heading">No matching courses found</h2>
          <p>Try adjusting your search query or selecting a different status filter.</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleResetFilters}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Course Cards Grid */}
      {!loading && !error && courses.length > 0 && (
        <>
          <section className="trainer-courses-grid" aria-label="Course list">
            {courses.map((course) => {
              const statusClass =
                course.status === 'PUBLISHED'
                  ? 'badge-published'
                  : course.status === 'DRAFT'
                  ? 'badge-draft'
                  : 'badge-archived';

              return (
                <article key={course.id} className="trainer-course-card">
                  <header className="card-top-header">
                    <span className={`badge ${statusClass}`}>{course.status}</span>
                    <span className="card-lesson-count ui-inline">
                      <UiIcon name="book-open" size={14} />
                      {course.lessonCount ?? 0} {course.lessonCount === 1 ? 'lesson' : 'lessons'}
                    </span>
                  </header>

                  <div className="card-content-area">
                    <span className="card-category-tag">
                      {course.subject || 'General'} • {course.level || 'All Levels'}
                    </span>
                    <h3 className="card-course-title">{course.title}</h3>
                    <p className="card-course-summary">
                      {course.summary || course.description || 'No summary provided.'}
                    </p>
                  </div>

                  <footer className="card-action-footer">
                    <Link
                      to={`/trainer/courses/${course.id}/lessons`}
                      className="btn btn-sm btn-primary"
                      title="Manage syllabus and lessons"
                    >
                      Manage Lessons ({course.lessonCount ?? 0})
                    </Link>
                    <Link
                      to={`/trainer/courses/${course.id}/edit`}
                      className="btn btn-sm btn-secondary"
                      title="Edit course metadata"
                    >
                      Edit Details
                    </Link>
                    <Link
                      to={`/courses/${course.id}`}
                      className="btn btn-sm btn-secondary ui-inline"
                      title="View student public page"
                    >
                      Preview
                      <UiIcon name="external-link" size={14} />
                    </Link>
                  </footer>
                </article>
              );
            })}
          </section>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="courses-pagination" aria-label="Trainer courses pagination">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                aria-label="Previous Page"
              >
                ← Previous
              </button>
              <span className="page-indicator">
                Page {currentPage} of {totalPages} ({totalItems} courses)
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                aria-label="Next Page"
              >
                Next →
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  );
}