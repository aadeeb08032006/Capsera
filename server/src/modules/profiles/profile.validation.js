import { z } from 'zod';

function nullableTrimmedString(max) {
  let schema = z.string({ invalid_type_error: 'Must be a string' }).trim();
  if (max) {
    schema = schema.max(max, `Must not exceed ${max} characters`);
  }
  return z
    .preprocess((val) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed === '' ? null : trimmed;
      }
      return val;
    }, schema.nullable().optional())
    .default(null);
}

export const traineeProfileSchema = z
  .object({
    headline: nullableTrimmedString(200),
    organization: nullableTrimmedString(200),
    biography: nullableTrimmedString(),
    qualifications: nullableTrimmedString(),
    workExperience: nullableTrimmedString(),
    interests: nullableTrimmedString(),
    externalCertifications: nullableTrimmedString(),
    userId: z.any().optional(),
    user_id: z.any().optional(),
  })
  .strict();

export const trainerProfileSchema = z
  .object({
    headline: nullableTrimmedString(200),
    organization: nullableTrimmedString(200),
    biography: nullableTrimmedString(),
    qualifications: nullableTrimmedString(),
    workExperience: nullableTrimmedString(),
    subjectExpertise: nullableTrimmedString(255),
    yearsOfExperience: z
      .number({
        invalid_type_error: 'yearsOfExperience must be a number',
        required_error: 'yearsOfExperience is required',
      })
      .min(0, 'yearsOfExperience must be between 0 and 80')
      .max(80, 'yearsOfExperience must be between 0 and 80')
      .refine(
        (val) => Number.isFinite(val) && Number(val.toFixed(1)) === val,
        'yearsOfExperience cannot have more than one decimal place',
      )
      .optional()
      .default(0),
    userId: z.any().optional(),
    user_id: z.any().optional(),
  })
  .strict();

export function getValidationMessage(error) {
  return error.issues
    .map((issue) => {
      const field = issue.path.join('.');
      return field ? `${field}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
