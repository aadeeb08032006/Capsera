import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  areSkillListsEqual,
  buildSkillSavePayload,
  evaluateConfirmClearAction,
  evaluateSaveAction,
  syncPersistedSkillRows,
  toDraftRow,
  validateDraftRows,
} from './skillMappingEditorLogic.js';

describe('SkillMappingEditor safety & state logic', () => {
  it('allows adding and saving skills normally for trainee and trainer modes', () => {
    const persisted = [];
    const addedTrainee = [toDraftRow({ skillId: '1', skillName: 'Python', proficiency: 3 }, false)];

    assert.equal(areSkillListsEqual(addedTrainee, persisted, false), false);
    assert.equal(
      evaluateSaveAction({
        draftCount: addedTrainee.length,
        persistedCount: persisted.length,
        hasUnsavedChanges: true,
        confirmClearOpen: false,
        controlsDisabled: false,
        hasOnSave: true,
      }),
      'SUBMIT',
    );
    assert.deepEqual(buildSkillSavePayload(addedTrainee, false), [{ skillId: '1', proficiency: 3 }]);

    const addedTrainer = [
      toDraftRow(
        { skillId: '2', skillName: 'PostgreSQL', proficiency: 4, yearsOfExperience: 3.5 },
        true,
      ),
    ];
    assert.deepEqual(validateDraftRows(addedTrainer, true), {});
    assert.deepEqual(buildSkillSavePayload(addedTrainer, true), [
      { skillId: '2', proficiency: 4, yearsOfExperience: 3.5 },
    ]);
  });

  it('detects edits to existing mappings and clears dirty state once synced back', () => {
    const persisted = [
      toDraftRow({ skillId: '1', skillName: 'Python', proficiency: 2, yearsOfExperience: 1 }, true),
    ];
    const edited = [
      toDraftRow({ skillId: '1', skillName: 'Python', proficiency: 4, yearsOfExperience: 2.5 }, true),
    ];
    const reverted = [
      toDraftRow({ skillId: '1', skillName: 'Python', proficiency: 2, yearsOfExperience: 1 }, true),
    ];

    assert.equal(areSkillListsEqual(edited, persisted, true), false);
    assert.equal(areSkillListsEqual(reverted, persisted, true), true);
    assert.equal(
      evaluateSaveAction({
        draftCount: 1,
        persistedCount: 1,
        hasUnsavedChanges: false,
        confirmClearOpen: false,
        controlsDisabled: false,
        hasOnSave: true,
      }),
      'NOOP',
    );
  });

  it('allows removing one skill while retaining others without triggering clear confirmation', () => {
    const persisted = [
      toDraftRow({ skillId: '1', skillName: 'Python', proficiency: 3 }, false),
      toDraftRow({ skillId: '2', skillName: 'SQL', proficiency: 2 }, false),
    ];
    const retainedOne = [persisted[0]];

    assert.equal(areSkillListsEqual(retainedOne, persisted, false), false);
    assert.equal(
      evaluateSaveAction({
        draftCount: retainedOne.length,
        persistedCount: persisted.length,
        hasUnsavedChanges: true,
        confirmClearOpen: false,
        controlsDisabled: false,
        hasOnSave: true,
      }),
      'SUBMIT',
    );
  });

  it('opens confirmation on first Save when clearing previously saved skills, and NEVER submits on repeated Save clicks', () => {
    const firstClick = evaluateSaveAction({
      draftCount: 0,
      persistedCount: 2,
      hasUnsavedChanges: true,
      confirmClearOpen: false,
      controlsDisabled: false,
      hasOnSave: true,
    });
    assert.equal(firstClick, 'OPEN_CONFIRM');

    const secondClick = evaluateSaveAction({
      draftCount: 0,
      persistedCount: 2,
      hasUnsavedChanges: true,
      confirmClearOpen: true,
      controlsDisabled: false,
      hasOnSave: true,
    });
    assert.equal(secondClick, 'NOOP');

    const thirdClick = evaluateSaveAction({
      draftCount: 0,
      persistedCount: 2,
      hasUnsavedChanges: true,
      confirmClearOpen: true,
      controlsDisabled: false,
      hasOnSave: true,
    });
    assert.equal(thirdClick, 'NOOP');
  });

  it('requires explicit Confirm Clear & Save click to submit an empty list, and synchronizes persisted state afterwards', () => {
    assert.equal(
      evaluateConfirmClearAction({
        draftCount: 0,
        persistedCount: 2,
        hasUnsavedChanges: true,
        confirmClearOpen: false,
        controlsDisabled: false,
        hasOnSave: true,
      }),
      'NOOP',
    );

    assert.equal(
      evaluateConfirmClearAction({
        draftCount: 0,
        persistedCount: 2,
        hasUnsavedChanges: true,
        confirmClearOpen: true,
        controlsDisabled: false,
        hasOnSave: true,
      }),
      'SUBMIT',
    );

    const syncedAfterClear = syncPersistedSkillRows([], [], [], false);
    assert.deepEqual(syncedAfterClear, []);
    assert.equal(areSkillListsEqual(syncedAfterClear, syncedAfterClear, false), true);
  });

  it('never opens destructive confirmation or submits on an empty profile with no previously saved mappings', () => {
    assert.equal(
      evaluateSaveAction({
        draftCount: 0,
        persistedCount: 0,
        hasUnsavedChanges: false,
        confirmClearOpen: false,
        controlsDisabled: false,
        hasOnSave: true,
      }),
      'NOOP',
    );

    assert.equal(
      evaluateSaveAction({
        draftCount: 0,
        persistedCount: 0,
        hasUnsavedChanges: true,
        confirmClearOpen: false,
        controlsDisabled: false,
        hasOnSave: true,
      }),
      'NOOP',
    );

    assert.equal(
      evaluateConfirmClearAction({
        draftCount: 0,
        persistedCount: 0,
        hasUnsavedChanges: true,
        confirmClearOpen: true,
        controlsDisabled: false,
        hasOnSave: true,
      }),
      'NOOP',
    );
  });

  it('synchronizes persisted rows when parent returns updated mappings or void fallback', () => {
    const draft = [toDraftRow({ skillId: '10', skillName: 'Cloud', proficiency: 4 }, false)];
    const payload = buildSkillSavePayload(draft, false);

    const fromVoid = syncPersistedSkillRows(undefined, payload, draft, false);
    assert.equal(fromVoid[0].skillName, 'Cloud');
    assert.equal(fromVoid[0].proficiency, 4);

    const fromServer = syncPersistedSkillRows(
      [{ id: '99', skillId: '10', skillName: 'Cloud', category: 'Infra', proficiency: 4 }],
      payload,
      draft,
      false,
    );
    assert.equal(fromServer[0].category, 'Infra');
    assert.equal(areSkillListsEqual(draft, fromServer, false), true);
  });
});
