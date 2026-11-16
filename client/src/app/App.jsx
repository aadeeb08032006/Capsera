import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { fetchApiHealth } from '../services/apiClient.js';
import { AuthProvider } from '../features/auth/AuthContext.jsx';
import RoleGuard from '../features/auth/RoleGuard.jsx';
import Navbar from '../features/courses/Navbar.jsx';
import CourseCataloguePage from '../features/courses/CourseCataloguePage.jsx';
import CourseDetailPage from '../features/courses/CourseDetailPage.jsx';
import MyLearningPage from '../features/courses/MyLearningPage.jsx';
import LessonViewerPage from '../features/courses/LessonViewerPage.jsx';
import TrainerCoursesPage from '../features/courses/TrainerCoursesPage.jsx';
import CourseFormPage from '../features/courses/CourseFormPage.jsx';
import ManageLessonsPage from '../features/courses/ManageLessonsPage.jsx';
import '../features/courses/courses.css';

function FoundationHomePage() {
  const [healthState, setHealthState] = useState({
    loading: true,
    data: null,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    fetchApiHealth(false)
      .then((res) => {
        if (isMounted) {
          setHealthState({ loading: false, data: res.data, error: null });
        }
      })
      .catch((err) => {
        if (isMounted) {
          setHealthState({
            loading: false,
            data: null,
            error: err.message || 'Backend API unreachable',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="foundation-container">
      <header className="foundation-header">
        <span className="foundation-badge">SIH26075 • MVP Foundation</span>
        <h1>CAPSERA</h1>
        <p className="foundation-subtitle">
          Digital Capacity Building and Learning Management Portal
        </p>
      </header>

      <section className="foundation-card" aria-labelledby="status-heading">
        <h2 id="status-heading">Shared Technical Foundation Status</h2>
        <p>
          Canonical workspace initialized per <strong>CAPSERA PRD v1.0</strong>. Feature modules
          (Auth, Profiles, Courses, Assessments, Competency, Certificates, Announcements, and Admin
          Dashboard) will be mounted by Members 1–4.
        </p>

        <div className="status-box" role="status" aria-live="polite">
          <strong>API Health Check (`/api/v1/health`): </strong>
          {healthState.loading && <span>Checking backend connectivity...</span>}
          {!healthState.loading && healthState.data && (
            <span className="status-ok">
              {healthState.data.status} ({healthState.data.service})
            </span>
          )}
          {!healthState.loading && healthState.error && (
            <span className="status-offline">
              Offline ({healthState.error})
            </span>
          )}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        {/* Redirect root to Course Catalogue */}
        <Route path="/" element={<Navigate to="/courses" replace />} />
        <Route path="/foundation" element={<FoundationHomePage />} />

        {/* Public & Trainee Course Routes */}
        <Route path="/courses" element={<CourseCataloguePage />} />
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route
          path="/courses/:courseId/lessons/:lessonId"
          element={
            <RoleGuard allowedRoles={['TRAINEE', 'TRAINER', 'ADMIN']}>
              <LessonViewerPage />
            </RoleGuard>
          }
        />

        {/* Trainee Learning Routes (Trainee only) */}
        <Route
          path="/my-learning"
          element={
            <RoleGuard allowedRoles={['TRAINEE']}>
              <MyLearningPage />
            </RoleGuard>
          }
        />

        {/* Trainer Course Management Routes (Trainer & Admin only) */}
        <Route
          path="/trainer/courses"
          element={
            <RoleGuard allowedRoles={['TRAINER', 'ADMIN']}>
              <TrainerCoursesPage />
            </RoleGuard>
          }
        />
        <Route
          path="/trainer/courses/new"
          element={
            <RoleGuard allowedRoles={['TRAINER', 'ADMIN']}>
              <CourseFormPage />
            </RoleGuard>
          }
        />
        <Route
          path="/trainer/courses/:courseId/edit"
          element={
            <RoleGuard allowedRoles={['TRAINER', 'ADMIN']}>
              <CourseFormPage />
            </RoleGuard>
          }
        />
        <Route
          path="/trainer/courses/:courseId/lessons"
          element={
            <RoleGuard allowedRoles={['TRAINER', 'ADMIN']}>
              <ManageLessonsPage />
            </RoleGuard>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/courses" replace />} />
      </Routes>
    </AuthProvider>
  );
}
