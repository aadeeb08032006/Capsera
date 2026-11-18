import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardIcon } from '../admin/AdminLayout.jsx';
import TraineeLayout from '../trainee/TraineeLayout.jsx';
import { getMyTraineeSkills, replaceMyTraineeSkills } from './competencyApi.js';
import SkillMappingEditor from './SkillMappingEditor.jsx';
import { useSkillMappingPage } from './useSkillMappingPage.js';
import './competency.css';

/**
 * Trainee Skill Mapping page (`TRAINEE` role).
 * Hydrates saved mappings and full canonical skill catalogue, and persists
 * replace-all updates via PUT /api/v1/profiles/me/skills.
 */
export default function TraineeSkillsPage() {
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
    fetchMySkills: getMyTraineeSkills,
    replaceMySkills: replaceMyTraineeSkills,
  });

  return (
    <TraineeLayout
      title="My Skills"
      eyebrow="Competency Profile"
      subtitle="Maintain your canonical skill profile and proficiency levels for course and trainer matching."
      headerActions={
        <div className="trainee-header-actions">
          <Link
            to="/trainers/recommendations"
            className="admin-dashboard-btn admin-dashboard-btn-secondary"
          >
            Find Trainers
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
      <div className="trainee-skills-summary-grid" aria-label="Skill profile summary">
        <div className="trainee-skills-stat-card">
          <span className="trainee-skills-stat-label">Saved Skill Mappings</span>
          <p className="trainee-skills-stat-value">{savedSkills.length}</p>
          <p className="trainee-skills-stat-sub">Persisted on your trainee profile</p>
        </div>

        <div className="trainee-skills-stat-card">
          <span className="trainee-skills-stat-label">Canonical Catalogue</span>
          <p className="trainee-skills-stat-value">{availableSkills.length}</p>
          <p className="trainee-skills-stat-sub">Available skills across platform</p>
        </div>

        <div className="trainee-skills-stat-card">
          <span className="trainee-skills-stat-label">Proficiency Scale</span>
          <p className="trainee-skills-stat-value">1 &ndash; 4</p>
          <p className="trainee-skills-stat-sub">
            1 Beginner &middot; 2 Intermediate &middot; 3 Advanced &middot; 4 Expert
          </p>
        </div>
      </div>

      {loadError && (
        <div className="competency-banner-actions">
          <button
            type="button"
            className="competency-btn competency-btn-secondary"
            onClick={retryLoad}
          >
            Retry Loading Skills
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="competency-banner competency-banner-success" role="status">
          {saveSuccess}
        </div>
      )}

      <SkillMappingEditor
        mode="trainee"
        availableSkills={availableSkills}
        initialSkills={savedSkills}
        isLoading={isLoading}
        loadError={loadError}
        isSaving={isSaving}
        saveError={saveError}
        onSave={handleSave}
      />
    </TraineeLayout>
  );
}
