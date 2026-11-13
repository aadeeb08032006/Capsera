import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import ProficiencySelect from './ProficiencySelect.jsx';
import './competency.css';

const DEFAULT_PROFICIENCY = 2;

function normalizeMode(mode) {
  return String(mode).toLowerCase() === 'trainer' ? 'trainer' : 'trainee';
}

function toDraftRow(item, isTrainer) {
  const skillId = String(item.skillId);
  const proficiency = Number(item.proficiency);
  const years =
    isTrainer && item.yearsOfExperience !== undefined && item.yearsOfExperience !== null
      ? String(item.yearsOfExperience)
      : '0';

  return {
    skillId,
    skillName: item.skillName || item.name || `Skill #${skillId}`,
    category: item.category || '',
    proficiency: Number.isInteger(proficiency) && proficiency >= 1 && proficiency <= 4
      ? proficiency
      : DEFAULT_PROFICIENCY,
    yearsOfExperienceInput: years,
  };
}

function validateYearsOfExperience(rawInput) {
  const trimmed = String(rawInput ?? '').trim();
  if (trimmed === '') {
    return { valid: false, message: 'Enter years of experience (0–80).' };
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0 || num > 80) {
    return { valid: false, message: 'Years of experience must be between 0 and 80.' };
  }
  if (Math.abs(Math.round(num * 10) - num * 10) >= 1e-12) {
    return { valid: false, message: 'Use at most 1 decimal place (e.g. 2.5).' };
  }
  return { valid: true, value: num };
}

function validateDraftRows(rows, isTrainer) {
  const rowErrors = {};
  const seenSkillIds = new Set();

  for (const row of rows) {
    const errorsForRow = {};

    if (!row.skillId || seenSkillIds.has(row.skillId)) {
      errorsForRow.skillId = 'Duplicate skill selected.';
    }
    seenSkillIds.add(row.skillId);

    if (!Number.isInteger(row.proficiency) || row.proficiency < 1 || row.proficiency > 4) {
      errorsForRow.proficiency = 'Proficiency must be an integer between 1 and 4.';
    }

    if (isTrainer) {
      const yearsResult = validateYearsOfExperience(row.yearsOfExperienceInput);
      if (!yearsResult.valid) {
        errorsForRow.yearsOfExperience = yearsResult.message;
      }
    }

    if (Object.keys(errorsForRow).length > 0) {
      rowErrors[row.skillId] = errorsForRow;
    }
  }

  return rowErrors;
}

/**
 * Reusable skill mapping editor for TRAINEE and TRAINER profiles.
 * Owns local draft edits, duplicate prevention, validation, and empty-list
 * clear confirmation without performing API calls or auth directly.
 *
 * @param {object} props
 * @param {'trainee' | 'trainer' | 'TRAINEE' | 'TRAINER'} [props.mode='trainee']
 * @param {Array<{ id: string, name: string, category?: string }>} [props.availableSkills=[]]
 * @param {Array<{ id?: string, skillId: string, skillName?: string, category?: string, proficiency: number, yearsOfExperience?: number }>} [props.initialSkills=[]]
 * @param {boolean} [props.isLoading=false] - Initial fetch in progress
 * @param {string | null} [props.loadError=null] - Initial fetch error; disables saving when set
 * @param {boolean} [props.isSaving=false] - Save request in progress
 * @param {string | null} [props.saveError=null] - Save error displayed while preserving edits
 * @param {boolean} [props.disabled=false] - Disables all editor interactions
 * @param {(skills: Array<{ skillId: string, proficiency: number, yearsOfExperience?: number }>) => Promise<void> | void} props.onSave
 * @param {string} [props.title] - Optional heading override
 * @param {string} [props.description] - Optional subtitle override
 */
export default function SkillMappingEditor({
  mode = 'trainee',
  availableSkills = [],
  initialSkills = [],
  isLoading = false,
  loadError = null,
  isSaving = false,
  saveError = null,
  disabled = false,
  onSave,
  title,
  description,
}) {
  const normalizedMode = normalizeMode(mode);
  const isTrainer = normalizedMode === 'trainer';
  const headingId = useId();
  const addSkillSelectId = useId();

  const [draftSkills, setDraftSkills] = useState(() =>
    (initialSkills || []).map((item) => toDraftRow(item, isTrainer)),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [selectedNewSkillId, setSelectedNewSkillId] = useState('');
  const [newProficiency, setNewProficiency] = useState(DEFAULT_PROFICIENCY);
  const [newYearsInput, setNewYearsInput] = useState('0');
  const [addError, setAddError] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const lastSyncedInitialRef = useRef(initialSkills);
  const lastModeRef = useRef(normalizedMode);

  useEffect(() => {
    const modeChanged = lastModeRef.current !== normalizedMode;
    const initialChanged = lastSyncedInitialRef.current !== initialSkills;

    if (modeChanged || (!isDirty && initialChanged && !isLoading)) {
      setDraftSkills((initialSkills || []).map((item) => toDraftRow(item, isTrainer)));
      setRowErrors({});
      setAddError(null);
      setConfirmClearOpen(false);
      if (modeChanged) {
        setIsDirty(false);
      }
      lastSyncedInitialRef.current = initialSkills;
      lastModeRef.current = normalizedMode;
    }
  }, [initialSkills, isDirty, isLoading, isTrainer, normalizedMode]);

  const selectedIds = useMemo(
    () => new Set(draftSkills.map((item) => item.skillId)),
    [draftSkills],
  );

  const selectableSkills = useMemo(
    () =>
      (availableSkills || []).filter((skill) => !selectedIds.has(String(skill.id))),
    [availableSkills, selectedIds],
  );

  const controlsDisabled = disabled || isLoading || isSaving || Boolean(loadError);
  const canSave = !controlsDisabled && typeof onSave === 'function';

  function handleAddSkill(event) {
    event.preventDefault();
    setAddError(null);
    setConfirmClearOpen(false);

    if (!selectedNewSkillId) {
      setAddError('Select a skill from the catalogue first.');
      return;
    }

    const opaqueId = String(selectedNewSkillId);
    if (selectedIds.has(opaqueId)) {
      setAddError('This skill is already in your mapping.');
      return;
    }

    if (!Number.isInteger(newProficiency) || newProficiency < 1 || newProficiency > 4) {
      setAddError('Proficiency must be an integer between 1 and 4.');
      return;
    }

    if (isTrainer) {
      const yearsCheck = validateYearsOfExperience(newYearsInput);
      if (!yearsCheck.valid) {
        setAddError(yearsCheck.message);
        return;
      }
    }

    const catalogMatch = (availableSkills || []).find(
      (skill) => String(skill.id) === opaqueId,
    );
    if (!catalogMatch) {
      setAddError('Selected skill is no longer available in the catalogue.');
      return;
    }

    setDraftSkills((prev) => [
      ...prev,
      {
        skillId: opaqueId,
        skillName: catalogMatch.name,
        category: catalogMatch.category || '',
        proficiency: newProficiency,
        yearsOfExperienceInput: isTrainer ? String(newYearsInput).trim() : '0',
      },
    ]);
    setIsDirty(true);
    setSelectedNewSkillId('');
    setNewProficiency(DEFAULT_PROFICIENCY);
    setNewYearsInput('0');
  }

  function handleProficiencyChange(skillId, nextProficiency) {
    setDraftSkills((prev) =>
      prev.map((row) =>
        row.skillId === skillId ? { ...row, proficiency: nextProficiency } : row,
      ),
    );
    setRowErrors((prev) => {
      if (!prev[skillId]?.proficiency) return prev;
      const next = { ...prev };
      const { proficiency: _removed, ...rest } = next[skillId];
      if (Object.keys(rest).length === 0) {
        delete next[skillId];
      } else {
        next[skillId] = rest;
      }
      return next;
    });
    setIsDirty(true);
  }

  function handleYearsChange(skillId, rawValue) {
    setDraftSkills((prev) =>
      prev.map((row) =>
        row.skillId === skillId ? { ...row, yearsOfExperienceInput: rawValue } : row,
      ),
    );
    setRowErrors((prev) => {
      if (!prev[skillId]?.yearsOfExperience) return prev;
      const next = { ...prev };
      const { yearsOfExperience: _removed, ...rest } = next[skillId];
      if (Object.keys(rest).length === 0) {
        delete next[skillId];
      } else {
        next[skillId] = rest;
      }
      return next;
    });
    setIsDirty(true);
  }

  function handleRemoveSkill(skillId) {
    setDraftSkills((prev) => prev.filter((row) => row.skillId !== skillId));
    setRowErrors((prev) => {
      if (!prev[skillId]) return prev;
      const next = { ...prev };
      delete next[skillId];
      return next;
    });
    setConfirmClearOpen(false);
    setIsDirty(true);
  }

  async function submitValidatedPayload() {
    const errors = validateDraftRows(draftSkills, isTrainer);
    setRowErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = draftSkills.map((row) =>
      isTrainer
        ? {
            skillId: row.skillId,
            proficiency: row.proficiency,
            yearsOfExperience: Number(String(row.yearsOfExperienceInput).trim()),
          }
        : {
            skillId: row.skillId,
            proficiency: row.proficiency,
          },
    );

    try {
      const result = await onSave(payload);
      if (result !== false) {
        setConfirmClearOpen(false);
        setIsDirty(false);
      }
    } catch {
      // Preserve unsaved edits; parent displays error via saveError prop.
    }
  }

  function handleSaveClick() {
    if (!canSave) return;

    if (draftSkills.length === 0 && !confirmClearOpen) {
      setConfirmClearOpen(true);
      return;
    }

    void submitValidatedPayload();
  }

  const defaultTitle = isTrainer ? 'Trainer Expertise Mapping' : 'My Skill Mapping';
  const defaultDescription = isTrainer
    ? 'Select canonical skills you can teach, set your proficiency (1–4), and record years of experience (0–80, up to 1 decimal).'
    : 'Select canonical skills from the catalogue and set your current proficiency level (1–4).';

  return (
    <section className="competency-card" aria-labelledby={headingId}>
      <header className="competency-card-header">
        <div>
          <h2 id={headingId} className="competency-title">
            {title || defaultTitle}
          </h2>
          <p className="competency-subtitle">{description || defaultDescription}</p>
        </div>
        {isDirty && !isLoading && (
          <span className="competency-badge-unsaved" role="status">
            Unsaved changes
          </span>
        )}
      </header>

      {isLoading && (
        <div className="competency-banner competency-banner-info" role="status" aria-live="polite">
          Loading saved skill mappings...
        </div>
      )}

      {loadError && (
        <div className="competency-banner competency-banner-error" role="alert">
          <strong>Unable to load skill mappings:</strong> {loadError} Saving is disabled until
          data loads successfully.
        </div>
      )}

      {saveError && (
        <div className="competency-banner competency-banner-error" role="alert">
          <strong>Save failed:</strong> {saveError}
        </div>
      )}

      <form className="competency-add-form" onSubmit={handleAddSkill} noValidate>
        <div className="competency-field competency-add-skill">
          <label className="competency-label" htmlFor={addSkillSelectId}>
            Add skill from catalogue
          </label>
          <select
            id={addSkillSelectId}
            className="competency-select"
            value={selectedNewSkillId}
            onChange={(e) => {
              setSelectedNewSkillId(e.target.value);
              setAddError(null);
            }}
            disabled={controlsDisabled || selectableSkills.length === 0}
          >
            <option value="">
              {selectableSkills.length === 0
                ? 'All available skills selected'
                : 'Choose a skill...'}
            </option>
            {selectableSkills.map((skill) => (
              <option key={String(skill.id)} value={String(skill.id)}>
                {skill.category ? `${skill.name} (${skill.category})` : skill.name}
              </option>
            ))}
          </select>
        </div>

        <ProficiencySelect
          label="Proficiency"
          value={newProficiency}
          onChange={(next) => {
            setNewProficiency(next);
            setAddError(null);
          }}
          disabled={controlsDisabled}
        />

        {isTrainer && (
          <div className="competency-field competency-years-field">
            <label className="competency-label" htmlFor={`${addSkillSelectId}-years`}>
              Years experience
            </label>
            <input
              id={`${addSkillSelectId}-years`}
              type="number"
              inputMode="decimal"
              min="0"
              max="80"
              step="0.1"
              className="competency-input"
              value={newYearsInput}
              onChange={(e) => {
                setNewYearsInput(e.target.value);
                setAddError(null);
              }}
              disabled={controlsDisabled}
            />
          </div>
        )}

        <div className="competency-add-action">
          <button
            type="submit"
            className="competency-btn competency-btn-secondary"
            disabled={controlsDisabled || selectableSkills.length === 0}
          >
            Add Skill
          </button>
        </div>
      </form>

      {addError && (
        <p className="competency-field-error" role="alert">
          {addError}
        </p>
      )}

      {draftSkills.length === 0 ? (
        <div className="competency-empty-state">
          <p>No skills currently mapped. Add skills above or save an empty list to clear all.</p>
        </div>
      ) : (
        <div className="competency-table-wrap">
          <table className="competency-table">
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Category</th>
                <th scope="col">Proficiency</th>
                {isTrainer && <th scope="col">Years Experience</th>}
                <th scope="col" className="competency-col-actions">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {draftSkills.map((row) => {
                const errors = rowErrors[row.skillId] || {};
                const yearsInputId = `years-${row.skillId}`;

                return (
                  <tr key={row.skillId}>
                    <td data-label="Skill" className="competency-cell-skill">
                      {row.skillName}
                    </td>
                    <td data-label="Category" className="competency-cell-category">
                      {row.category || '—'}
                    </td>
                    <td data-label="Proficiency">
                      <ProficiencySelect
                        ariaLabel={`Proficiency for ${row.skillName}`}
                        value={row.proficiency}
                        onChange={(val) => handleProficiencyChange(row.skillId, val)}
                        disabled={controlsDisabled}
                        error={errors.proficiency || null}
                      />
                    </td>
                    {isTrainer && (
                      <td data-label="Years Experience">
                        <div className="competency-field">
                          <input
                            id={yearsInputId}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="80"
                            step="0.1"
                            aria-label={`Years of experience for ${row.skillName}`}
                            className={`competency-input ${
                              errors.yearsOfExperience ? 'competency-input-error' : ''
                            }`.trim()}
                            value={row.yearsOfExperienceInput}
                            onChange={(e) => handleYearsChange(row.skillId, e.target.value)}
                            disabled={controlsDisabled}
                          />
                          {errors.yearsOfExperience && (
                            <p className="competency-field-error" role="alert">
                              {errors.yearsOfExperience}
                            </p>
                          )}
                        </div>
                      </td>
                    )}
                    <td data-label="Action" className="competency-col-actions">
                      <button
                        type="button"
                        className="competency-btn competency-btn-danger-outline"
                        onClick={() => handleRemoveSkill(row.skillId)}
                        disabled={controlsDisabled}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmClearOpen && (
        <div className="competency-confirm-box" role="alertdialog" aria-live="assertive">
          <p className="competency-confirm-text">
            <strong>Confirm clearing all skills:</strong> Saving an empty list will remove all
            saved skill mappings from your profile.
          </p>
          <div className="competency-confirm-actions">
            <button
              type="button"
              className="competency-btn competency-btn-danger"
              onClick={() => void submitValidatedPayload()}
              disabled={!canSave}
            >
              {isSaving ? 'Saving...' : 'Confirm Clear & Save'}
            </button>
            <button
              type="button"
              className="competency-btn competency-btn-secondary"
              onClick={() => setConfirmClearOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <footer className="competency-card-footer">
        <button
          type="button"
          className="competency-btn competency-btn-primary"
          onClick={handleSaveClick}
          disabled={!canSave}
        >
          {isSaving ? 'Saving...' : 'Save Skill Mappings'}
        </button>
      </footer>
    </section>
  );
}
