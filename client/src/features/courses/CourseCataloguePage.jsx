import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listCourses } from './coursesApi.js';
import UiIcon from '../../components/UiIcon.jsx';

const COURSE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

export default function CourseCataloguePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [courses, setCourses] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 9,
    totalItems: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form filter state synchronized with URL query params
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get('subject') || '');
  const [selectedLevel, setSelectedLevel] = useState(searchParams.get('level') || '');
  const currentPage = Number(searchParams.get('page')) || 1;

  const fetchCatalogCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCourses({
        page: currentPage,
        pageSize: 9,
        search: searchParams.get('search') || undefined,
        subject: searchParams.get('subject') || undefined,
        level: searchParams.get('level') || undefined,
      });

      setCourses(data?.items || []);
      if (data?.pagination) {
        setPagination(data.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to load course catalogue');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams, currentPage]);

  useEffect(() => {
    fetchCatalogCourses();
  }, [fetchCatalogCourses]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    const nextParams = new URLSearchParams();
    if (searchTerm.trim()) nextParams.set('search', searchTerm.trim());
    if (selectedSubject.trim()) nextParams.set('subject', selectedSubject.trim());
    if (selectedLevel) nextParams.set('level', selectedLevel);
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedSubject('');
    setSelectedLevel('');
    setSearchParams({});
  };

  const handlePageChange = (newPage) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', String(newPage));
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="courses-page-container">
      <header className="courses-catalogue-header">
        <span className="courses-badge-pill">Course Directory</span>
        <h1>Course Catalogue</h1>
        <p className="courses-subtitle">
          Explore organizational capacity-building courses, syllabus modules, and learning tracks.
        </p>
      </header>

      {/* Accessible Search & Filter Bar */}
      <section className="courses-filter-section" aria-labelledby="filter-heading">
        <h2 id="filter-heading" className="courses-sr-only">
          Filter Courses
        </h2>
        <form className="courses-filter-form" onSubmit={handleFilterSubmit}>
          <div className="courses-form-group">
            <label htmlFor="course-search-input">Search Title or Topic</label>
            <input
              id="course-search-input"
              type="search"
              className="courses-input"
              placeholder="e.g. Atmospheric Data, Leadership..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="courses-form-group">
            <label htmlFor="course-subject-input">Subject</label>
            <input
              id="course-subject-input"
              type="text"
              className="courses-input"
              placeholder="e.g. Meteorology"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
            />
          </div>

          <div className="courses-form-group">
            <label htmlFor="course-level-select">Level</label>
            <select
              id="course-level-select"
              className="courses-select"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
            >
              <option value="">All Levels</option>
              {COURSE_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <div className="courses-filter-buttons">
            <button type="submit" className="courses-btn courses-btn-primary">
              Apply Filters
            </button>
            {(searchTerm || selectedSubject || selectedLevel) && (
              <button
                type="button"
                className="courses-btn courses-btn-secondary"
                onClick={handleResetFilters}
              >
                Reset
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Loading State */}
      {loading && (
        <div className="courses-loading-container" role="status" aria-live="polite">
          <div className="courses-spinner" aria-hidden="true" />
          <p>Loading course catalogue...</p>
        </div>
      )}

      {/* Error State with Retry Button */}
      {!loading && error && (
        <div className="courses-state-card courses-state-error" role="alert">
          <h2>Error Loading Catalogue</h2>
          <p>{error}</p>
          <button
            type="button"
            className="courses-btn courses-btn-secondary"
            onClick={fetchCatalogCourses}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && courses.length === 0 && (
        <div className="courses-state-card courses-state-empty" role="status">
          <div className="courses-empty-icon" aria-hidden="true">
            <UiIcon name="book-open" size={34} />
          </div>
          <h2>No Courses Found</h2>
          <p>We couldn't find any courses matching your filter criteria.</p>
          <button
            type="button"
            className="courses-btn courses-btn-primary"
            onClick={handleResetFilters}
          >
            Clear Filters & View All
          </button>
        </div>
      )}

      {/* Course Cards Grid */}
      {!loading && !error && courses.length > 0 && (
        <>
          <div className="courses-results-meta" aria-live="polite">
            <span>
              Showing {courses.length} of {pagination.totalItems} courses
            </span>
          </div>

          <section className="courses-grid" aria-label="Course list">
            {courses.map((course) => (
              <article key={course.id} className="courses-card">
                <div className="courses-card-thumbnail">
                  {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      alt={`Thumbnail for ${course.title}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="courses-card-placeholder" aria-hidden="true">
                      <span>{course.subject?.slice(0, 2).toUpperCase() || 'CP'}</span>
                    </div>
                  )}
                  {course.level && (
                    <span className={`courses-badge-level courses-level-${course.level.toLowerCase()}`}>
                      {course.level}
                    </span>
                  )}
                </div>

                <div className="courses-card-body">
                  {course.subject && (
                    <span className="courses-card-subject">{course.subject}</span>
                  )}
                  <h3 className="courses-card-title">
                    <Link to={`/courses/${course.id}`}>{course.title}</Link>
                  </h3>
                  <p className="courses-card-summary">
                    {course.summary || 'Comprehensive instructional coursework.'}
                  </p>

                  <div className="courses-card-footer">
                    <span className="courses-card-lessons ui-inline">
                      <UiIcon name="book-open" size={15} />
                      {course.lessonCount ?? 0} {course.lessonCount === 1 ? 'lesson' : 'lessons'}
                    </span>
                    <Link
                      to={`/courses/${course.id}`}
                      className="courses-btn courses-btn-secondary courses-btn-sm"
                      aria-label={`View details for ${course.title}`}
                    >
                      View Course
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </section>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <nav className="courses-pagination" aria-label="Catalogue pagination">
              <button
                type="button"
                className="courses-btn courses-btn-secondary"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
                aria-label="Go to previous page"
              >
                ← Previous
              </button>

              <span className="courses-pagination-indicator" aria-current="page">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                type="button"
                className="courses-btn courses-btn-secondary"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
                aria-label="Go to next page"
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
