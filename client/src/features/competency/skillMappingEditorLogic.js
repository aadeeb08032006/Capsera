export const DEFAULT_PROFICIENCY = 2;

export function normalizeMode(mode) {
  return String(mode).toLowerCase() === 'trainer' ? 'trainer' : 'trainee';
}

export function toDraftRow(item, isTrainer) {
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
    proficiency:
      Number.isInteger(proficiency) && proficiency >= 1 && proficiency <= 4
        ? proficiency
        : DEFAULT_PROFICIENCY,
    yearsOfExperienceInput: years,
  };
}

export function validateYearsOfExperience(rawInput) {
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

export function validateDraftRows(rows, isTrainer) {
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

function buildSerializedDraft(rows, isTrainer) {
  return rows.map((row) =>
    isTrainer
      ? `${row.skillId}:${row.proficiency}:${String(row.yearsOfExperienceInput ?? '').trim()}`
      : `${row.skillId}:${row.proficiency}`,
  );
}

export function areSkillListsEqual(draftRows, persistedRows, isTrainer) {
  if (draftRows.length !== persistedRows.length) {
    return false;
  }
  const a = buildSerializedDraft(draftRows, isTrainer);
  const b = buildSerializedDraft(persistedRows, isTrainer);
  return a.every((entry, idx) => entry === b[idx]);
}

export function buildSkillSavePayload(draftRows, isTrainer) {
  return draftRows.map((row) =>
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
}

export function syncPersistedSkillRows(saveResult, submittedPayload, draftRows, isTrainer) {
  const nextSource = Array.isArray(saveResult) ? saveResult : submittedPayload;
  return nextSource.map((item) => {
    const draftMatch = draftRows.find((row) => row.skillId === String(item.skillId));
    return toDraftRow(
      {
        ...item,
        skillName: item.skillName || item.name || draftMatch?.skillName,
        category: item.category ?? draftMatch?.category,
      },
      isTrainer,
    );
  });
}

/**
 * Determine what clicking the ordinary "Save Skill Mappings" button should do.
 * Repeated clicks on ordinary Save must never submit an empty clear payload.
 *
 * @returns {'NOOP' | 'OPEN_CONFIRM' | 'SUBMIT'}
 */
export function evaluateSaveAction({
  draftCount,
  persistedCount,
  hasUnsavedChanges,
  confirmClearOpen,
  controlsDisabled,
  hasOnSave,
}) {
  if (controlsDisabled || !hasOnSave || !hasUnsavedChanges) {
    return 'NOOP';
  }

  if (draftCount === 0) {
    if (persistedCount > 0 && !confirmClearOpen) {
      return 'OPEN_CONFIRM';
    }
    return 'NOOP';
  }

  return 'SUBMIT';
}

/**
 * Determine whether clicking "Confirm Clear & Save" should submit.
 *
 * @returns {'NOOP' | 'SUBMIT'}
 */
export function evaluateConfirmClearAction({
  draftCount,
  persistedCount,
  hasUnsavedChanges,
  confirmClearOpen,
  controlsDisabled,
  hasOnSave,
}) {
  if (
    controlsDisabled ||
    !hasOnSave ||
    !hasUnsavedChanges ||
    !confirmClearOpen ||
    draftCount !== 0 ||
    persistedCount <= 0
  ) {
    return 'NOOP';
  }

  return 'SUBMIT';
}
