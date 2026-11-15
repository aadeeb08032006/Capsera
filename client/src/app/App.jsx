import React, { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { fetchApiHealth } from '../services/apiClient.js';
import AnnouncementsFeedSection from '../features/announcements/AnnouncementsFeedSection.jsx';
import VerifyCertificatePage from '../features/certificates/VerifyCertificatePage.jsx';
import TrainerAssessmentBuilder from '../features/assessments/TrainerAssessmentBuilder.jsx';
import TrainerCourseResultsView from '../features/assessments/TrainerCourseResultsView.jsx';

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
        </div>
      </section>

      <AnnouncementsFeedSection />
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<FoundationHomePage />} />
      <Route path="/certificates/verify" element={<VerifyCertificatePage />} />
      <Route path="/certificates/verify/:certificateCode" element={<VerifyCertificatePage />} />
      <Route path="/courses/:courseId/assessments/manage" element={<TrainerAssessmentBuilder />} />
      <Route path="/courses/:courseId/assessments/results" element={<TrainerCourseResultsView />} />
      <Route path="/assessments/manage" element={<TrainerAssessmentBuilder />} />
      <Route path="/assessments/results" element={<TrainerCourseResultsView />} />
    </Routes>
  );
}

