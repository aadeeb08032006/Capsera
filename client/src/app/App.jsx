import React, { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { fetchApiHealth } from '../services/apiClient.js';
import { useAuth } from '../features/auth/AuthContext.jsx';

import Navbar from '../components/Navbar.jsx';
import ProtectedRoute from '../features/auth/ProtectedRoute.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import SignupPage from '../features/auth/SignupPage.jsx';
import NotAuthorizedPage from '../features/auth/NotAuthorizedPage.jsx';
import DashboardPage from '../features/auth/DashboardPage.jsx';
import ChangePasswordPage from '../features/auth/ChangePasswordPage.jsx';
import ProfilePage from '../features/profiles/ProfilePage.jsx';

import AdminUsersPage from '../features/admin/AdminUsersPage.jsx';
import AdminDashboardPage from '../features/admin/AdminDashboardPage.jsx';
import AdminLayout from '../features/admin/AdminLayout.jsx';
import AdminAnnouncementsPage from '../features/announcements/AdminAnnouncementsPage.jsx';
import AnnouncementsFeedSection from '../features/announcements/AnnouncementsFeedSection.jsx';
import AdminSkillsPage from '../features/competency/AdminSkillsPage.jsx';
import TraineeSkillsPage from '../features/competency/TraineeSkillsPage.jsx';
import TrainerSkillsPage from '../features/competency/TrainerSkillsPage.jsx';
import TrainerRecommendationsPage from '../features/competency/TrainerRecommendationsPage.jsx';
import MyCertificatesPage from '../features/certificates/MyCertificatesPage.jsx';
import VerifyCertificatePage from '../features/certificates/VerifyCertificatePage.jsx';

import TrainerAssessmentBuilder from '../features/assessments/TrainerAssessmentBuilder.jsx';
import TrainerCourseResultsView from '../features/assessments/TrainerCourseResultsView.jsx';
import QuizPlayer from '../features/assessments/QuizPlayer.jsx';
import CourseFeedbackForm from '../features/assessments/CourseFeedbackForm.jsx';

import CourseCataloguePage from '../features/courses/CourseCataloguePage.jsx';
import CourseDetailPage from '../features/courses/CourseDetailPage.jsx';
import MyLearningPage from '../features/courses/MyLearningPage.jsx';
import LessonViewerPage from '../features/courses/LessonViewerPage.jsx';
import TrainerCoursesPage from '../features/courses/TrainerCoursesPage.jsx';
import CourseFormPage from '../features/courses/CourseFormPage.jsx';
import ManageLessonsPage from '../features/courses/ManageLessonsPage.jsx';

import '../features/courses/courses.css';

function AuthenticatedHomePage() {
  return (
    <>
      <DashboardPage />
      <div className="dashboard-announcements">
        <AnnouncementsFeedSection />
      </div>
    </>
  );
}

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
        <h2>Member 3: Assessments &amp; Evaluations Portal</h2>
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
            📊 Course Results &amp; Analytics
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
            ⭐ Course Feedback &amp; Ratings
          </Link>
        </div>
      </section>

      <AnnouncementsFeedSection />
    </main>
  );
}

export default function App() {
  const { user } = useAuth();

  return (
    <>
      <Navbar />
      <Routes>
        {/* Public auth routes (Member 1) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/not-authorized" element={<NotAuthorizedPage />} />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />

        {/* Member 1: User & Admin Governance */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE', 'TRAINER']}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminLayout embeddedPage sectionLabel="User Management">
                <AdminUsersPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Member 4: Competency, Certificates, Announcements & Admin Dashboard */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/skills"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminSkillsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/announcements"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminAnnouncementsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/skills"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE']}>
              <TraineeSkillsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trainer/skills"
          element={
            <ProtectedRoute allowedRoles={['TRAINER']}>
              <TrainerSkillsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trainers/recommendations"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE', 'ADMIN']}>
              <AdminLayout embeddedPage sectionLabel="Trainer Recommendations">
                <TrainerRecommendationsPage coursesPath="/courses" />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/certificates"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE']}>
              <MyCertificatesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/certificates/verify" element={<VerifyCertificatePage />} />
        <Route path="/certificates/verify/:certificateCode" element={<VerifyCertificatePage />} />

        {/* Member 2: Courses & Learning Resources */}
        <Route path="/courses" element={<CourseCataloguePage />} />
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route
          path="/courses/:courseId/lessons/:lessonId"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE', 'TRAINER', 'ADMIN']}>
              <LessonViewerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-learning"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE']}>
              <MyLearningPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trainer/courses"
          element={
            <ProtectedRoute allowedRoles={['TRAINER', 'ADMIN']}>
              <AdminLayout embeddedPage sectionLabel="Course Management">
                <TrainerCoursesPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trainer/courses/new"
          element={
            <ProtectedRoute allowedRoles={['TRAINER', 'ADMIN']}>
              <AdminLayout embeddedPage sectionLabel="Create Course">
                <CourseFormPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trainer/courses/:courseId/edit"
          element={
            <ProtectedRoute allowedRoles={['TRAINER', 'ADMIN']}>
              <AdminLayout embeddedPage sectionLabel="Edit Course">
                <CourseFormPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trainer/courses/:courseId/lessons"
          element={
            <ProtectedRoute allowedRoles={['TRAINER', 'ADMIN']}>
              <AdminLayout embeddedPage sectionLabel="Manage Lessons">
                <ManageLessonsPage />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Member 3: Assessments & Evaluations Routes */}
        <Route
          path="/courses/:courseId/assessments/manage"
          element={
            <ProtectedRoute allowedRoles={['TRAINER', 'ADMIN']}>
              <TrainerAssessmentBuilder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses/:courseId/assessments/results"
          element={
            <ProtectedRoute allowedRoles={['TRAINER', 'ADMIN']}>
              <TrainerCourseResultsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessments/manage"
          element={
            <ProtectedRoute allowedRoles={['TRAINER', 'ADMIN']}>
              <TrainerAssessmentBuilder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessments/results"
          element={
            <ProtectedRoute allowedRoles={['TRAINER', 'ADMIN']}>
              <TrainerCourseResultsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses/:courseId/assessments/:assessmentId/player"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE', 'ADMIN']}>
              <QuizPlayer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessments/:assessmentId/player"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE', 'ADMIN']}>
              <QuizPlayer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses/:courseId/feedback"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE', 'ADMIN']}>
              <CourseFeedbackForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/feedback/:courseId"
          element={
            <ProtectedRoute allowedRoles={['TRAINEE', 'ADMIN']}>
              <CourseFeedbackForm />
            </ProtectedRoute>
          }
        />

        {/* Protected root */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AuthenticatedHomePage />
            </ProtectedRoute>
          }
        />

        {/* Legacy foundation portal */}
        <Route path="/foundation" element={<FoundationHomePage />} />
      </Routes>
    </>
  );
}
