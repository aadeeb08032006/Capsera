import React from 'react';
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
    <main className="competency-page">
      <header className="competency-page-header">
        <h1>My Skills</h1>
        <p className="competency-subtitle">
          Maintain your canonical skill profile and proficiency levels for course and trainer
          matching.
        </p>
      </header>

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
    </main>
  );
}
