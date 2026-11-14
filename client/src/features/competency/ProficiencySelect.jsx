import React, { useId } from 'react';

/**
 * Canonical proficiency levels from CAPSERA API Contract (1 = BEGINNER .. 4 = EXPERT).
 */
export const PROFICIENCY_LEVELS = [
  { value: 1, label: '1 — Beginner' },
  { value: 2, label: '2 — Intermediate' },
  { value: 3, label: '3 — Advanced' },
  { value: 4, label: '4 — Expert' },
];

/**
 * Accessible, controlled proficiency selector for integer levels 1–4.
 *
 * @param {object} props
 * @param {number | string} props.value - Current proficiency level (1..4 or '')
 * @param {(value: number | '') => void} props.onChange - Called with integer 1..4 (or '' if empty)
 * @param {string} [props.id] - Optional explicit element id
 * @param {string} [props.label] - Optional visible label text
 * @param {string} [props.ariaLabel] - Accessible label when no visible label is rendered
 * @param {boolean} [props.disabled=false] - Disables the select control
 * @param {boolean} [props.required=true] - Marks the field as required
 * @param {boolean} [props.allowEmpty=false] - Includes a placeholder option when true
 * @param {string} [props.emptyLabel='Select proficiency'] - Placeholder option text
 * @param {string | null} [props.error=null] - Validation error message
 * @param {string} [props.className=''] - Additional CSS class names
 */
export default function ProficiencySelect({
  value,
  onChange,
  id,
  label,
  ariaLabel,
  disabled = false,
  required = true,
  allowEmpty = false,
  emptyLabel = 'Select proficiency',
  error = null,
  className = '',
}) {
  const generatedId = useId();
  const selectId = id || `proficiency-${generatedId}`;
  const errorId = `${selectId}-error`;
  const normalizedValue = value === null || value === undefined ? '' : String(value);

  function handleChange(event) {
    const raw = event.target.value;
    if (raw === '') {
      onChange('');
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 4) {
      onChange(parsed);
    }
  }

  return (
    <div className={`competency-field ${className}`.trim()}>
      {label && (
        <label className="competency-label" htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`competency-select ${error ? 'competency-input-error' : ''}`.trim()}
        value={normalizedValue}
        onChange={handleChange}
        disabled={disabled}
        required={required}
        aria-label={!label ? ariaLabel || 'Proficiency level' : undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {PROFICIENCY_LEVELS.map((level) => (
          <option key={level.value} value={String(level.value)}>
            {level.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="competency-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
