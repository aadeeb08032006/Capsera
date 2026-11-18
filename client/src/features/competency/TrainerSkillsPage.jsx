import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardIcon } from '../admin/AdminLayout.jsx';
import TrainerLayout from '../trainer/TrainerLayout.jsx';
import { getMyTrainerSkills, replaceMyTrainerSkills } from './competencyApi.js';
import SkillMappingEditor from './SkillMappingEditor.jsx';
import { useSkillMappingPage } from './useSkillMappingPage.js';
import '../trainee/traineePortal.css';
import './competency.css';

/**
 * Trainer Expertise Mapping page (`TRAINER` role).
 * Hydrates saved trainer mappings and full canonical skill catalogue, and
 * persists replace-all updates via PUT /api/v1/profiles/me/trainer-skills.
 */
export default function TrainerSkillsPage() {
  const {
    availableSkills,
    savedSkills,
    isLoading,
    loadError,
    isSaving,
    saveError,
    saveSuccess,
    retryLoad,
    handleSave,
  } = useSkillMappingPage({
    fetchMySkills: getMyTrainerSkills,
    replaceMySkills: replaceMyTrainerSkills,
  });

  return (
    <TrainerLayout
      title="Trainer Expertise Mapping"
      eyebrow="Competency & Teaching Profile"
      subtitle="Declare your canonical teaching skills, proficiency levels, and years of experience."
      headerActions={
        <div className="trainer-header-actions">
          <Link
            to="/trainer/courses"
            className="admin-dashboard-btn admin-dashboard-btn-secondary"
          >
            My Courses
          </Link>
          <button
            type="button"
            className="admin-dashboard-btn admin-dashboard-btn-primary"
            onClick={retryLoad}
            disabled={isLoading || isSaving}
          >
            <DashboardIcon name="refresh" />
            <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
          </button>
        </div>
      }
    >
      <div className="trainee-skills-summary-grid" aria-label="Expertise profile summary">
        <div className="trainee-skills-stat-card">
          <span className="trainee-skills-stat-label">Declared Expertise</span>
          <p className="trainee-skills-stat-value">{savedSkills.length}</p>
          <p className="trainee-skills-stat-sub">Persisted teaching skill mappings</p>
        </div>

        <div className="trainee-skills-stat-card">
          <span className="trainee-skills-stat-label">Canonical Catalogue</span>
          <p className="trainee-skills-stat-value">{availableSkills.length}</p>
          <p className="trainee-skills-stat-sub">Platform skills available to map</p>
        </div>

        <div className="trainee-skills-stat-card">
          <span className="trainee-skills-stat-label">Experience Range</span>
          <p className="trainee-skills-stat-value">0 &ndash; 80 yrs</p>
          <p className="trainee-skills-stat-sub">Supports up to 1 decimal place (1&ndash;4 scale)</p>
        </div>
      </div>

      {loadError && (
        <div className="competency-banner-actions">
          <button
            type="button"
            className="competency-btn competency-btn-secondary"
            onClick={retryLoad}
          >
            Retry Loading Expertise
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="competency-banner competency-banner-success" role="status">
          {saveSuccess}
        </div>
      )}

      <SkillMappingEditor
        mode="trainer"
        availableSkills={availableSkills}
        initialSkills={savedSkills}
        isLoading={isLoading}
        loadError={loadError}
        isSaving={isSaving}
        saveError={saveError}
        onSave={handleSave}
      />
    </TrainerLayout>
  );
}
