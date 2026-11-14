import React from 'react';
import { getMyTrainerSkills, replaceMyTrainerSkills } from './competencyApi.js';
import SkillMappingEditor from './SkillMappingEditor.jsx';
import { useSkillMappingPage } from './useSkillMappingPage.js';
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
    <main className="competency-page">
      <header className="competency-page-header">
        <h1>Trainer Expertise Mapping</h1>
        <p className="competency-subtitle">
          Declare your canonical teaching skills, proficiency levels, and years of experience.
        </p>
      </header>

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
    </main>
  );
}
