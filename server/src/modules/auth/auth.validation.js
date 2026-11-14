import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(255, 'Must be at most 255 characters')
  .pipe(z.email({ message: 'Must be a valid email address' }));

const passwordSchema = z
  .string()
  .refine((password) => Buffer.byteLength(password, 'utf8') >= 8, {
    message: 'Must be at least 8 bytes',
  })
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Must be at most 72 bytes',
  })
  .refine((password) => /\p{L}/u.test(password), {
    message: 'Must contain at least one letter',
  })
  .refine((password) => /[0-9]/.test(password), {
    message: 'Must contain at least one number',
  });

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Must not be empty').max(150, 'Must be at most 150 characters'),
    email: emailSchema,
    password: passwordSchema,
    role: z.enum(['TRAINEE', 'TRAINER'], {
      error: 'Must be TRAINEE or TRAINER',
    }),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string(),
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
