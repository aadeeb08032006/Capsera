import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCourseListQueryForRole,
  formatTimeAllowedLabel,
  resolveCourseSelection,
  resolveInitialRemainingSeconds,
  resolveResumedQuestions,
  shouldRenderCountdown,
} from './assessmentHelpers.js';

test('QuizPlayer timer & resume helpers', async (t) => {
  await t.test('untimed assessment start keeps remainingSeconds as null and never 0', () => {
    for (const durationMinutes of [null, undefined, '', 0]) {
      const remaining = resolveInitialRemainingSeconds({
        serverRemainingSeconds: undefined,
        durationMinutes,
      });
      assert.equal(remaining, null);
      assert.equal(shouldRenderCountdown(remaining), false);
    }
    assert.equal(formatTimeAllowedLabel(null), 'Untimed');
  });

  await t.test('untimed assessment resume keeps remainingSeconds as null and recovers questions', () => {
    const remaining = resolveInitialRemainingSeconds({
      serverRemainingSeconds: null,
      durationMinutes: null,
    });
    assert.equal(remaining, null);
    assert.equal(shouldRenderCountdown(remaining), false);

    const assessmentQuestions = [
      { id: '11', questionText: 'Untimed Q1', optionA: 'Yes', optionB: 'No' },
    ];
    const resumed = resolveResumedQuestions({
      resumeQuestions: undefined,
      assessmentQuestions,
    });
    assert.deepEqual(resumed, assessmentQuestions);
  });

  await t.test('timed assessment start computes positive seconds and enables countdown', () => {
    const remaining = resolveInitialRemainingSeconds({
      serverRemainingSeconds: undefined,
      durationMinutes: 15,
    });
    assert.equal(remaining, 900);
    assert.equal(shouldRenderCountdown(remaining), true);
    assert.equal(formatTimeAllowedLabel(15), '15 Min');
  });

  await t.test('timed assessment resume preserves server remainingSeconds including expired 0', () => {
    const activeRemaining = resolveInitialRemainingSeconds({
      serverRemainingSeconds: 245,
      durationMinutes: 15,
    });
    assert.equal(activeRemaining, 245);
    assert.equal(shouldRenderCountdown(activeRemaining), true);

    const expiredRemaining = resolveInitialRemainingSeconds({
      serverRemainingSeconds: 0,
      durationMinutes: 15,
    });
    assert.equal(expiredRemaining, 0);
    assert.equal(shouldRenderCountdown(expiredRemaining), true);
  });
});

test('Course selection helpers never fall back to hard-coded course ID 1', async (t) => {
  await t.test('returns empty string when neither routeCourseId nor selectedCourseId exists', () => {
    assert.equal(resolveCourseSelection({}), '');
    assert.equal(resolveCourseSelection({ routeCourseId: undefined, selectedCourseId: '' }), '');
  });

  await t.test('preserves explicit routeCourseId or user-selected course ID', () => {
    assert.equal(resolveCourseSelection({ routeCourseId: '42', selectedCourseId: '99' }), '42');
    assert.equal(resolveCourseSelection({ routeCourseId: undefined, selectedCourseId: '99' }), '99');
  });

  await t.test('scopes course lookup to owned courses for TRAINER role', () => {
    assert.deepEqual(buildCourseListQueryForRole('TRAINER'), {
      mine: 'true',
      page: 1,
      pageSize: 100,
    });
    assert.deepEqual(buildCourseListQueryForRole('ADMIN'), {
      page: 1,
      pageSize: 100,
    });
  });
});
