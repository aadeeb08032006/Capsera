import { useCallback, useEffect, useState } from 'react';
import { listAllSkills } from './competencyApi.js';

/**
 * Shared state and lifecycle hook for role-specific skill mapping pages
 * (TraineeSkillsPage and TrainerSkillsPage).
 *
 * @param {object} params
 * @param {(options?: RequestInit) => Promise<Array>} params.fetchMySkills
 * @param {(skills: Array, options?: RequestInit) => Promise<Array>} params.replaceMySkills
 */
export function useSkillMappingPage({ fetchMySkills, replaceMySkills }) {
  const [availableSkills, setAvailableSkills] = useState([]);
  const [savedSkills, setSavedSkills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      fetchMySkills({ signal: controller.signal }),
      listAllSkills({ signal: controller.signal }),
    ])
      .then(([myMappings, catalogSkills]) => {
        if (!active) return;
        setSavedSkills(myMappings);
        setAvailableSkills(catalogSkills);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!active || error.name === 'AbortError') return;
        setLoadError(error.message || 'Failed to load skill mapping data.');
        setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [fetchMySkills, reloadCounter]);

  const retryLoad = useCallback(() => {
    setSaveError(null);
    setSaveSuccess(null);
    setReloadCounter((count) => count + 1);
  }, []);

  const handleSave = useCallback(
    async (skillsPayload) => {
      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(null);

      try {
        const updatedSkills = await replaceMySkills(skillsPayload);
        setSavedSkills(updatedSkills);
        setSaveSuccess(
          updatedSkills.length === 0
            ? 'All skill mappings cleared.'
            : `Saved ${updatedSkills.length} skill mapping${updatedSkills.length === 1 ? '' : 's'}.`,
        );
        return updatedSkills;
      } catch (error) {
        setSaveError(error.message || 'Failed to save skill mappings.');
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [replaceMySkills],
  );

  return {
    availableSkills,
    savedSkills,
    isLoading,
    loadError,
    isSaving,
    saveError,
    saveSuccess,
    retryLoad,
    handleSave,
  };
}
