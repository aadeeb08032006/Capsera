/**
 * Canonical CAPSERA constants from PRD v1.0 Section 10.3 & 11.1.
 * Do not introduce synonyms or alternate casing without a team decision record.
 */

export const ROLES = Object.freeze({
  TRAINEE: 'TRAINEE',
  TRAINER: 'TRAINER',
  ADMIN: 'ADMIN',
});

export const USER_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
});

export const COURSE_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
});

export const ASSESSMENT_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  CLOSED: 'CLOSED',
});

export const ENROLLMENT_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

export const ATTEMPT_STATUSES = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  GRADED: 'GRADED',
  EXPIRED: 'EXPIRED',
});

export const RESOURCE_TYPES = Object.freeze({
  VIDEO: 'VIDEO',
  PRESENTATION: 'PRESENTATION',
  DOCUMENT: 'DOCUMENT',
  LINK: 'LINK',
  OTHER: 'OTHER',
});

export const PAGINATION_DEFAULTS = Object.freeze({
  PAGE: 1,
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
});

