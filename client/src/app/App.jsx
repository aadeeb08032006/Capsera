import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { fetchApiHealth } from '../services/apiClient.js';
import { AuthProvider } from '../features/auth/AuthContext.jsx';
import RoleGuard from '../features/auth/RoleGuard.jsx';
import Navbar from '../features/courses/Navbar.jsx';

// Courses Pages (Member 2)
import CourseCataloguePage from '../features/courses/CourseCataloguePage.jsx';
import CourseDetailPage from '../features/courses/CourseDetailPage.jsx';
import MyLearningPage from '../features/courses/MyLearningPage.jsx';
import LessonViewerPage from '../features/courses/LessonViewerPage.jsx';
import TrainerCoursesPage from '../features/courses/TrainerCoursesPage.jsx';
import CourseFormPage from '../features/courses/CourseFormPage.jsx';
import ManageLessonsPage from '../features/courses/ManageLessonsPage.jsx';

// Announcements & Certificates Pages (Member 4)
import AnnouncementsFeedSection from '../features/announcements/AnnouncementsFeedSection.jsx';
import VerifyCertificatePage from '../features/certificates/VerifyCertificatePage.jsx';

// Assessments & Feedback Pages (Member 3)
import TrainerAssessmentBuilder from '../features/assessments/TrainerAssessmentBuilder.jsx';
import TrainerCourseResultsView from '../features/assessments/TrainerCourseResultsView.jsx';
import QuizPlayer from '../features/assessments/QuizPlayer.jsx';
import CourseFeedbackForm from '../features/assessments/CourseFeedbackForm.jsx';

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

        <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          <Link to="/certificates/verify">Verify a Completion Certificate</Link>
        </p>
      </section>

      <section className="foundation-card" style={{ marginTop: '1.5rem' }}>
        <h2>Member 3: Assessments & Evaluations Portal</h2>
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
          Interactive interfaces for instructors to author MCQ assessments and analyze student evaluations.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Link
            to="/courses/1/assessments/manage"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1.1rem',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: 500,
              fontSize: '0.9rem',
            }}
          >
            ✏️ Trainer Quiz Builder
          </Link>
          <Link
            to="/courses/1/assessments/results"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1.1rem',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              border: '1px solid #cbd5e1',
              fontWeight: 500,
              fontSize: '0.9rem',
            }}
          >
            📊 Course Results & Analytics
          </Link>
          <Link
            to="/courses/1/assessments/1/player"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1.1rem',
              backgroundColor: '#10b981',
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: 500,
              fontSize: '0.9rem',
            }}
          >
            🚀 Trainee Quiz Player
          </Link>
          <Link
            to="/courses/1/feedback"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1.1rem',
              backgroundColor: '#f8fafc',
              color: '#d97706',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              border: '1px solid #fde68a',
              fontWeight: 500,
              fontSize: '0.9rem',
            }}
          >
            ⭐ Course Feedback & Ratings
          </Link>
        </div>
      </section>

      <AnnouncementsFeedSection />
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

        {/* Public & Trainee Course Routes (Member 2) */}
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

        {/* Member 3: Assessments & Evaluations Routes */}
        <Route path="/courses/:courseId/assessments/manage" element={<TrainerAssessmentBuilder />} />
        <Route path="/courses/:courseId/assessments/results" element={<TrainerCourseResultsView />} />
        <Route path="/assessments/manage" element={<TrainerAssessmentBuilder />} />
        <Route path="/assessments/results" element={<TrainerCourseResultsView />} />
        <Route path="/courses/:courseId/assessments/:assessmentId/player" element={<QuizPlayer />} />
        <Route path="/assessments/:assessmentId/player" element={<QuizPlayer />} />
        <Route path="/courses/:courseId/feedback" element={<CourseFeedbackForm />} />
        <Route path="/feedback/:courseId" element={<CourseFeedbackForm />} />

        {/* Member 4: Certificate Verification Routes */}
        <Route path="/certificates/verify" element={<VerifyCertificatePage />} />
        <Route path="/certificates/verify/:certificateCode" element={<VerifyCertificatePage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/courses" replace />} />
      </Routes>
    </AuthProvider>
  );
}
