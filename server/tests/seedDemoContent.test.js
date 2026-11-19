import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExecuteQuery,
  mockPoolEnd,
  mockCreateSkill,
  mockReplaceMyTraineeSkills,
  mockReplaceMyTrainerSkills,
  mockCreateCourse,
  mockPublishCourse,
  mockCreateLesson,
  mockCreateCourseResource,
  mockEnrollInCourse,
  mockMarkLessonComplete,
  mockCreateAssessment,
  mockCreateQuestion,
  mockPublishAssessment,
  mockStartAttempt,
  mockSubmitAttempt,
  mockUpsertCourseFeedback,
  mockCreateAnnouncement,
} = vi.hoisted(() => ({
  mockExecuteQuery: vi.fn(),
  mockPoolEnd: vi.fn(),
  mockCreateSkill: vi.fn(),
  mockReplaceMyTraineeSkills: vi.fn(),
  mockReplaceMyTrainerSkills: vi.fn(),
  mockCreateCourse: vi.fn(),
  mockPublishCourse: vi.fn(),
  mockCreateLesson: vi.fn(),
  mockCreateCourseResource: vi.fn(),
  mockEnrollInCourse: vi.fn(),
  mockMarkLessonComplete: vi.fn(),
  mockCreateAssessment: vi.fn(),
  mockCreateQuestion: vi.fn(),
  mockPublishAssessment: vi.fn(),
  mockStartAttempt: vi.fn(),
  mockSubmitAttempt: vi.fn(),
  mockUpsertCourseFeedback: vi.fn(),
  mockCreateAnnouncement: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({}));

vi.mock('../src/config/db.js', () => ({
  executeQuery: mockExecuteQuery,
  pool: { end: mockPoolEnd },
}));

vi.mock('../src/modules/competency/skills.service.js', () => ({
  createSkill: mockCreateSkill,
  replaceMyTraineeSkills: mockReplaceMyTraineeSkills,
  replaceMyTrainerSkills: mockReplaceMyTrainerSkills,
}));

vi.mock('../src/modules/courses/course.service.js', () => ({
  createCourse: mockCreateCourse,
  publishCourse: mockPublishCourse,
}));

vi.mock('../src/modules/courses/lesson.service.js', () => ({
  createLesson: mockCreateLesson,
}));

vi.mock('../src/modules/courses/resource.service.js', () => ({
  createCourseResource: mockCreateCourseResource,
}));

vi.mock('../src/modules/enrollments/enrollment.service.js', () => ({
  enrollInCourse: mockEnrollInCourse,
  markLessonComplete: mockMarkLessonComplete,
}));

vi.mock('../src/modules/assessments/assessment.service.js', () => ({
  createAssessment: mockCreateAssessment,
  createQuestion: mockCreateQuestion,
  publishAssessment: mockPublishAssessment,
  startAttempt: mockStartAttempt,
  submitAttempt: mockSubmitAttempt,
  upsertCourseFeedback: mockUpsertCourseFeedback,
}));

vi.mock('../src/modules/announcements/announcements.service.js', () => ({
  createAnnouncement: mockCreateAnnouncement,
}));

import { seedDemoContent } from '../scripts/seed-demo-content.js';

const DEMO_USERS = {
  'admin@example.com': { id: '1', full_name: 'Admin', email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE' },
  'demo-trainer-1@example.com': { id: '5', full_name: 'Trainer 1', email: 'demo-trainer-1@example.com', role: 'TRAINER', status: 'ACTIVE' },
  'demo-trainer-2@example.com': { id: '6', full_name: 'Trainer 2', email: 'demo-trainer-2@example.com', role: 'TRAINER', status: 'ACTIVE' },
  'demo-trainee-1@example.com': { id: '2', full_name: 'Trainee 1', email: 'demo-trainee-1@example.com', role: 'TRAINEE', status: 'ACTIVE' },
  'demo-trainee-2@example.com': { id: '3', full_name: 'Trainee 2', email: 'demo-trainee-2@example.com', role: 'TRAINEE', status: 'ACTIVE' },
  'demo-trainee-3@example.com': { id: '4', full_name: 'Trainee 3', email: 'demo-trainee-3@example.com', role: 'TRAINEE', status: 'ACTIVE' },
};

describe('seedDemoContent safety & non-destructive idempotency', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('refuses execution when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(seedDemoContent()).rejects.toThrow(/NODE_ENV=production/);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it('refuses execution against non-demo databases (capsera_db / capsera_cp03_test)', async () => {
    mockExecuteQuery.mockResolvedValueOnce({ rows: [{ db: 'capsera_db' }] });
    await expect(seedDemoContent()).rejects.toThrow(/capsera_demo/);

    mockExecuteQuery.mockResolvedValueOnce({ rows: [{ db: 'capsera_cp03_test' }] });
    await expect(seedDemoContent()).rejects.toThrow(/capsera_demo/);
  });

  it('seeds competency mappings and feedback on initial run when tables are empty', async () => {
    let nextId = 100;
    mockExecuteQuery.mockImplementation(async (sql, params = []) => {
      if (sql.includes('current_database()')) return { rows: [{ db: 'capsera_demo' }] };
      if (sql.includes('FROM users WHERE LOWER(email)')) {
        return { rows: [DEMO_USERS[String(params[0]).toLowerCase()]] };
      }
      if (sql.includes('FROM trainer_skills')) return { rows: [] };
      if (sql.includes('FROM trainee_skills')) return { rows: [] };
      if (sql.includes('FROM feedback')) return { rows: [] };
      if (sql.includes('FROM lesson_progress')) return { rows: [] };
      if (sql.includes('FROM skills WHERE LOWER(name)')) return { rows: [] };
      if (sql.includes('FROM courses WHERE trainer_id')) return { rows: [{ id: '10', title: params[1], status: 'PUBLISHED' }] };
      if (sql.includes('FROM lessons WHERE course_id')) return { rows: [{ id: String(nextId++) }] };
      if (sql.includes('FROM learning_resources')) return { rows: [{ id: '1' }] };
      if (sql.includes('FROM assessments')) return { rows: [{ id: '20', status: 'PUBLISHED' }] };
      if (sql.includes('FROM questions')) return { rows: [{ id: '30' }] };
      if (sql.includes('FROM enrollments')) return { rows: [{ id: '40', status: 'ACTIVE' }] };
      if (sql.includes('FROM assessment_attempts')) return { rows: [{ id: '50', is_passed: true }] };
      if (sql.includes('FROM announcements')) return { rows: [{ id: '60' }] };
      if (sql.includes('AS users')) {
        return { rows: [{ users: 10, skills: 5, courses: 3, lessons: 8, resources: 5, assessments: 2, questions: 6, enrollments: 2, certificates: 1, announcements: 3 }] };
      }
      if (sql.includes('FROM certificates')) return { rows: [] };
      return { rows: [] };
    });

    mockCreateSkill.mockImplementation(async ({ name, category }) => ({ id: String(nextId++), name, category }));
    mockUpsertCourseFeedback.mockResolvedValue({ feedback: { id: '77' } });

    await seedDemoContent();

    expect(mockReplaceMyTrainerSkills).toHaveBeenCalledTimes(2);
    expect(mockReplaceMyTraineeSkills).toHaveBeenCalledTimes(2);
    expect(mockUpsertCourseFeedback).toHaveBeenCalledTimes(1);
    expect(mockMarkLessonComplete).toHaveBeenCalledTimes(4);
  });

  it('preserves existing competency mappings, lesson progress, and course feedback on rerun', async () => {
    let nextId = 200;
    mockExecuteQuery.mockImplementation(async (sql, params = []) => {
      if (sql.includes('current_database()')) return { rows: [{ db: 'capsera_demo' }] };
      if (sql.includes('FROM users WHERE LOWER(email)')) {
        return { rows: [DEMO_USERS[String(params[0]).toLowerCase()]] };
      }
      if (sql.includes('FROM trainer_skills')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('FROM trainee_skills')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('FROM feedback')) return { rows: [{ id: '77' }] };
      if (sql.includes('FROM lesson_progress')) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('FROM skills WHERE LOWER(name)')) return { rows: [{ id: '1', name: params[0], category: 'Test' }] };
      if (sql.includes('FROM courses WHERE trainer_id')) return { rows: [{ id: '10', title: params[1], status: 'PUBLISHED' }] };
      if (sql.includes('FROM lessons WHERE course_id')) return { rows: [{ id: String(nextId++) }] };
      if (sql.includes('FROM learning_resources')) return { rows: [{ id: '1' }] };
      if (sql.includes('FROM assessments')) return { rows: [{ id: '20', status: 'PUBLISHED' }] };
      if (sql.includes('FROM questions')) return { rows: [{ id: '30' }] };
      if (sql.includes('FROM enrollments')) return { rows: [{ id: '40', status: 'COMPLETED' }] };
      if (sql.includes('FROM assessment_attempts')) return { rows: [{ id: '50', is_passed: true }] };
      if (sql.includes('FROM announcements')) return { rows: [{ id: '60' }] };
      if (sql.includes('AS users')) {
        return { rows: [{ users: 10, skills: 5, courses: 3, lessons: 8, resources: 5, assessments: 2, questions: 6, enrollments: 2, certificates: 1, announcements: 3 }] };
      }
      if (sql.includes('FROM certificates')) return { rows: [] };
      return { rows: [] };
    });

    await seedDemoContent();

    expect(mockReplaceMyTrainerSkills).not.toHaveBeenCalled();
    expect(mockReplaceMyTraineeSkills).not.toHaveBeenCalled();
    expect(mockUpsertCourseFeedback).not.toHaveBeenCalled();
    expect(mockMarkLessonComplete).not.toHaveBeenCalled();
    expect(mockSubmitAttempt).not.toHaveBeenCalled();
  });
});
