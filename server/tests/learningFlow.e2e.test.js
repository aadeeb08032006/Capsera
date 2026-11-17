import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-e2e-learning-flow-32chars';
});

vi.mock('../src/config/db.js', () => ({
  executeQuery: vi.fn(),
  pool: { query: vi.fn() },
  withTransaction: vi.fn(),
  checkDatabaseConnection: vi.fn(),
}));

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { executeQuery, withTransaction } from '../src/config/db.js';

function makeToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: '1h' });
}

describe('End-to-End Learning Flow Test (Member 2)', () => {
  // Stateful database mock for realistic E2E journey
  let courses = [];
  let lessons = [];
  let enrollments = [];
  let lessonProgress = [];
  let nextCourseId = 1;
  let nextLessonId = 101;
  let nextEnrollmentId = 500;
  let nextProgressId = 1000;

  const trainerUser = {
    id: '10',
    full_name: 'Trainer Alice',
    email: 'trainer.alice@example.com',
    role: 'TRAINER',
    status: 'ACTIVE',
    created_at: new Date('2026-11-01T00:00:00.000Z'),
  };

  const traineeUser = {
    id: '20',
    full_name: 'Trainee Bob',
    email: 'trainee.bob@example.com',
    role: 'TRAINEE',
    status: 'ACTIVE',
    created_at: new Date('2026-11-01T00:00:00.000Z'),
  };

  const handleQuery = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // 1. Authenticate user lookup
    if (s.includes('FROM users WHERE id = $1')) {
      const id = String(params[0]);
      if (id === '10') return { rows: [trainerUser] };
      if (id === '20') return { rows: [traineeUser] };
      console.log('UNHANDLED SQL:', s, params);
    return { rows: [] };
    }

    // 2. Insert Course
    if (s.startsWith('INSERT INTO courses')) {
      const newCourse = {
        id: String(nextCourseId++),
        trainer_id: String(params[0]),
        title: params[1],
        summary: params[2],
        description: params[3],
        subject: params[4],
        level: params[5],
        thumbnail_url: params[6],
        status: params[7] || 'DRAFT',
        published_at: null,
        archived_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      courses.push(newCourse);
      return { rows: [newCourse] };
    }

    // 3. Course detail / lookup by ID
    if (s.includes('FROM courses c') && s.includes('WHERE c.id = $1')) {
      const c = courses.find((course) => String(course.id) === String(params[0]));
      if (!c) return { rows: [] };
      return {
        rows: [
          {
            ...c,
            trainer_name: c.trainer_id === '10' ? 'Trainer Alice' : 'Trainer',
            trainer_email: 'trainer@example.com',
            lesson_count: lessons.filter((l) => String(l.course_id) === String(c.id)).length,
          },
        ],
      };
    }

    // 4. Course lookup by id simple
    if (s.startsWith('SELECT') && s.includes('FROM courses') && s.includes('WHERE id = $1')) {
      const c = courses.find((course) => String(course.id) === String(params[0]));
      return { rows: c ? [c] : [] };
    }

    // 5. MAX lesson order query
    if (s.includes('MAX(lesson_order)') && s.includes('FROM lessons WHERE course_id = $1')) {
      const courseLessons = lessons.filter((l) => String(l.course_id) === String(params[0]));
      const maxOrder = courseLessons.reduce((max, l) => Math.max(max, l.lesson_order), 0);
      return { rows: [{ max_order: maxOrder }] };
    }

    // 6. Insert Lesson
    if (s.startsWith('INSERT INTO lessons')) {
      const newLesson = {
        id: String(nextLessonId++),
        course_id: String(params[0]),
        title: params[1],
        content: params[2],
        lesson_order: Number(params[3]),
        estimated_duration_minutes: params[4] ? Number(params[4]) : null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      lessons.push(newLesson);
      return { rows: [newLesson] };
    }

    // 7. Publish Course update
    if (s.startsWith('UPDATE courses SET status = $1')) {
      const c = courses.find((course) => String(course.id) === String(params[1]));
      if (c) {
        c.status = params[0];
        c.published_at = c.published_at || new Date();
        c.updated_at = new Date();
        return { rows: [c] };
      }
      console.log('UNHANDLED SQL:', s, params);
    return { rows: [] };
    }

    // 8. Trainee enrollment check for course detail view
    if (s.includes('FROM enrollments WHERE trainee_id = $1 AND course_id = $2')) {
      const e = enrollments.find(
        (enr) => String(enr.trainee_id) === String(params[0]) && String(enr.course_id) === String(params[1]),
      );
      return { rows: e ? [e] : [] };
    }

    // 9. Lessons list for course detail view
    if (s.includes('FROM lessons') && s.includes('WHERE course_id = $1 ORDER BY lesson_order ASC')) {
      const courseLessons = lessons
        .filter((l) => String(l.course_id) === String(params[0]))
        .sort((a, b) => a.lesson_order - b.lesson_order);
      return { rows: courseLessons };
    }

    // 10. Insert enrollment
    if (s.startsWith('INSERT INTO enrollments')) {
      const traineeId = String(params[0]);
      const courseId = String(params[1]);

      // Check unique constraint uq_enrollments_trainee_course
      const existing = enrollments.find(
        (enr) => String(enr.trainee_id) === traineeId && String(enr.course_id) === courseId,
      );
      if (existing) {
        const conflictErr = new Error('duplicate key value violates unique constraint');
        conflictErr.code = '23505';
        conflictErr.constraint = 'uq_enrollments_trainee_course';
        throw conflictErr;
      }

      const newEnrollment = {
        id: String(nextEnrollmentId++),
        trainee_id: traineeId,
        course_id: courseId,
        status: 'ACTIVE',
        enrolled_at: new Date(),
        completed_at: null,
        cancelled_at: null,
        updated_at: new Date(),
      };
      enrollments.push(newEnrollment);
      return { rows: [newEnrollment] };
    }

    // 11. Enrollment lookup by id
    if (s.includes('FROM enrollments WHERE id = $1')) {
      const e = enrollments.find((enr) => String(enr.id) === String(params[0]));
      return { rows: e ? [e] : [] };
    }

    // 12. Lesson lookup by id
    if (s.includes('FROM lessons WHERE id = $1')) {
      const l = lessons.find((les) => String(les.id) === String(params[0]));
      return { rows: l ? [l] : [] };
    }

    // 13. Insert lesson progress
    if (s.startsWith('INSERT INTO lesson_progress')) {
      const enrollmentId = String(params[0]);
      const courseId = String(params[1]);
      const lessonId = String(params[2]);

      const alreadyMarked = lessonProgress.some(
        (p) => String(p.enrollment_id) === enrollmentId && String(p.lesson_id) === lessonId,
      );
      if (!alreadyMarked) {
        lessonProgress.push({
          id: String(nextProgressId++),
          enrollment_id: enrollmentId,
          course_id: courseId,
          lesson_id: lessonId,
          completed_at: new Date(),
        });
      }
      return { rows: [] };
    }

    // 14. Count total lessons for course progress
    if (s.includes('SELECT COUNT(*)::int AS count FROM lessons WHERE course_id = $1')) {
      const count = lessons.filter((l) => String(l.course_id) === String(params[0])).length;
      return { rows: [{ count }] };
    }

    // 15. Count completed lessons for course progress
    if (s.includes('SELECT COUNT(*)::int AS count FROM lesson_progress WHERE enrollment_id = $1 AND course_id = $2')) {
      const count = lessonProgress.filter(
        (p) => String(p.enrollment_id) === String(params[0]) && String(p.course_id) === String(params[1]),
      );
      return { rows: [{ count: count.length }] };
    }

    // 16. Assessment check for completion hook
    if (s.includes('FROM assessments WHERE course_id = $1 AND status = $2')) {
      // No published assessments in this basic course flow
      return { rows: [] };
    }

    // 16b. Find course eligibility snapshot (PR #29 certificates integration)
    if (s.includes('FROM enrollments e') && s.includes('"enrollmentId"') && s.includes('"enrollmentStatus"')) {
      const traineeId = String(params[0]);
      const courseId = String(params[1]);
      const e = enrollments.find(
        (enr) => String(enr.trainee_id) === traineeId && String(enr.course_id) === courseId,
      );
      if (!e) return { rows: [] };

      const totalLessons = lessons.filter((l) => String(l.course_id) === courseId).length;
      const completedLessons = lessonProgress.filter(
        (p) => String(p.enrollment_id) === String(e.id) && String(p.course_id) === courseId,
      ).length;

      return {
        rows: [
          {
            enrollmentId: String(e.id),
            enrollmentStatus: e.status,
            completedAt: e.completed_at || null,
            totalLessons,
            completedLessons,
            requiredAssessmentCount: 0,
            passedRequiredAssessmentCount: 0,
          },
        ],
      };
    }

    // 17. Update enrollment status to COMPLETED
    if (s.startsWith('UPDATE enrollments')) {
      const enrollmentId = String(params[1] !== undefined ? params[1] : params[0]);
      const newStatus = params[1] !== undefined ? params[0] : 'COMPLETED';
      const e = enrollments.find((enr) => String(enr.id) === enrollmentId);
      if (e) {
        e.status = newStatus;
        e.completed_at = e.completed_at || new Date();
        e.updated_at = new Date();
        return { rows: [e] };
      }
      return { rows: [] };
    }

    // 17b. Certificate lookup and issuance mocks (PR #29 integration)
    if (s.includes('FROM certificates cert')) {
      return { rows: [] };
    }

    if (s.includes('INSERT INTO certificates')) {
      const c = courses.find((course) => String(course.id) === String(params[1])) || {};
      return {
        rows: [
          {
            id: '999',
            traineeId: String(params[0]),
            courseId: String(params[1]),
            courseTitle: c.title || 'Course Title',
            courseSubject: c.subject || 'Subject',
            certificateCode: String(params[2]),
            issuedAt: new Date(),
            revokedAt: null,
          },
        ],
      };
    }

    if (s.startsWith('INSERT INTO audit_logs')) {
      return { rows: [{ id: '1' }] };
    }

    // 18. GET /api/v1/enrollments/me
    if (s.includes('FROM enrollments e') && s.includes('JOIN courses c ON c.id = e.course_id') && s.includes('WHERE e.trainee_id = $1')) {
      const traineeEnrollments = enrollments.filter(
        (enr) => String(enr.trainee_id) === String(params[0]),
      );
      const rows = traineeEnrollments.map((enr) => {
        const c = courses.find((course) => String(course.id) === String(enr.course_id)) || {};
        return {
          id: enr.id,
          trainee_id: enr.trainee_id,
          course_id: enr.course_id,
          status: enr.status,
          enrolled_at: enr.enrolled_at,
          completed_at: enr.completed_at,
          cancelled_at: enr.cancelled_at,
          updated_at: enr.updated_at,
          course_title: c.title,
          course_summary: c.summary,
          course_subject: c.subject,
          course_level: c.level,
          course_thumbnail_url: c.thumbnail_url,
          course_status: c.status,
        };
      });
      return { rows };
    }

    console.log('UNHANDLED SQL:', s, params);
    return { rows: [] };
  };

  beforeEach(() => {
    courses = [];
    lessons = [];
    enrollments = [];
    lessonProgress = [];
    nextCourseId = 1;
    nextLessonId = 101;
    nextEnrollmentId = 500;
    nextProgressId = 1000;

    vi.resetAllMocks();
    executeQuery.mockImplementation(handleQuery);
    withTransaction.mockImplementation(async (work) => work({ query: handleQuery }));
  });

  it('executes full end-to-end learning lifecycle: create, add lessons, publish, enroll, complete, and track progress with failure edge cases', async () => {
    const trainerToken = makeToken('10');
    const traineeToken = makeToken('20');

    // =========================================================================
    // 1. Trainer creates a new course (POST /api/v1/courses)
    // =========================================================================
    const createCourseRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({
        title: 'Cloud-Native Enterprise Architecture',
        summary: 'Hands-on microservices and distributed systems.',
        description: 'Deep dive into distributed consensus, containers, and fault tolerance.',
        subject: 'Technology',
        level: 'INTERMEDIATE',
      });

    expect(createCourseRes.status).toBe(201);
    expect(createCourseRes.body.success).toBe(true);
    const createdCourse = createCourseRes.body.data.course;
    expect(createdCourse.id).toBe('1');
    expect(createdCourse.trainerId).toBe('10');
    expect(createdCourse.status).toBe('DRAFT');
    const courseId = createdCourse.id;

    // =========================================================================
    // 2. Trainer adds Lesson 1 (POST /api/v1/courses/:courseId/lessons)
    // =========================================================================
    const lesson1Res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({
        title: 'Lesson 1: Twelve-Factor Application Principles',
        content: 'Exploration of config, stateless processes, and port binding.',
        estimatedDurationMinutes: 20,
      });

    expect(lesson1Res.status).toBe(201);
    expect(lesson1Res.body.success).toBe(true);
    const lesson1 = lesson1Res.body.data.lesson;
    expect(lesson1.id).toBe('101');
    expect(lesson1.position).toBe(1);

    // =========================================================================
    // 3. Trainer adds Lesson 2 (POST /api/v1/courses/:courseId/lessons)
    // =========================================================================
    const lesson2Res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons`)
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({
        title: 'Lesson 2: Event Sourcing & CQRS',
        content: 'Designing append-only logs and projection materialized views.',
        estimatedDurationMinutes: 30,
      });

    expect(lesson2Res.status).toBe(201);
    expect(lesson2Res.body.success).toBe(true);
    const lesson2 = lesson2Res.body.data.lesson;
    expect(lesson2.id).toBe('102');
    expect(lesson2.position).toBe(2);

    // =========================================================================
    // 4. Trainer publishes the course (POST /api/v1/courses/:courseId/publish)
    // =========================================================================
    const publishRes = await request(app)
      .post(`/api/v1/courses/${courseId}/publish`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.success).toBe(true);
    expect(publishRes.body.data.course.status).toBe('PUBLISHED');
    expect(publishRes.body.data.course.publishedAt).toBeTruthy();

    // =========================================================================
    // 5. Failure Case 1: Unenrolled trainee cannot see lesson content
    //    (GET /api/v1/courses/:courseId)
    // =========================================================================
    const unenrolledCourseRes = await request(app)
      .get(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${traineeToken}`);

    expect(unenrolledCourseRes.status).toBe(200);
    expect(unenrolledCourseRes.body.success).toBe(true);
    expect(unenrolledCourseRes.body.data.course.title).toBe('Cloud-Native Enterprise Architecture');
    // Critical rule: unenrolled trainees receive metadata only; lessons array is undefined
    expect(unenrolledCourseRes.body.data.course.lessons).toBeUndefined();

    // =========================================================================
    // 6. Trainee enrolls in the published course
    //    (POST /api/v1/courses/:courseId/enrollments)
    // =========================================================================
    const enrollRes = await request(app)
      .post(`/api/v1/courses/${courseId}/enrollments`)
      .set('Authorization', `Bearer ${traineeToken}`);

    expect(enrollRes.status).toBe(201);
    expect(enrollRes.body.success).toBe(true);
    const enrollment = enrollRes.body.data.enrollment;
    expect(enrollment.id).toBe('500');
    expect(enrollment.traineeId).toBe('20');
    expect(enrollment.courseId).toBe('1');
    expect(enrollment.status).toBe('ACTIVE');
    const enrollmentId = enrollment.id;

    // =========================================================================
    // 7. Failure Case 2: Duplicate enrollment returns 409 Conflict
    //    (POST /api/v1/courses/:courseId/enrollments)
    // =========================================================================
    const duplicateEnrollRes = await request(app)
      .post(`/api/v1/courses/${courseId}/enrollments`)
      .set('Authorization', `Bearer ${traineeToken}`);

    expect(duplicateEnrollRes.status).toBe(409);
    expect(duplicateEnrollRes.body.success).toBe(false);
    expect(duplicateEnrollRes.body.error.code).toBe('DUPLICATE_ENROLLMENT');

    // =========================================================================
    // 8. Enrolled trainee can now inspect the ordered lessons
    //    (GET /api/v1/courses/:courseId)
    // =========================================================================
    const enrolledCourseRes = await request(app)
      .get(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${traineeToken}`);

    expect(enrolledCourseRes.status).toBe(200);
    expect(enrolledCourseRes.body.data.course.lessons).toBeDefined();
    expect(enrolledCourseRes.body.data.course.lessons.length).toBe(2);
    expect(enrolledCourseRes.body.data.course.lessons[0].id).toBe('101');
    expect(enrolledCourseRes.body.data.course.lessons[1].id).toBe('102');

    // =========================================================================
    // 9. Trainee marks Lesson 1 complete -> progress 50%
    //    (PATCH /api/v1/enrollments/:enrollmentId/progress)
    // =========================================================================
    const progress1Res = await request(app)
      .patch(`/api/v1/enrollments/${enrollmentId}/progress`)
      .set('Authorization', `Bearer ${traineeToken}`)
      .send({ lessonId: '101' });

    expect(progress1Res.status).toBe(200);
    expect(progress1Res.body.success).toBe(true);
    expect(progress1Res.body.data).toMatchObject({
      enrollmentId: '500',
      courseId: '1',
      lessonId: '101',
      completed: true,
      completedLessons: 1,
      totalLessons: 2,
      progressPercentage: 50,
      isComplete: false,
      status: 'ACTIVE',
    });

    // =========================================================================
    // 10. Trainee marks Lesson 2 complete -> progress 100%, completion hook triggers
    //     (PATCH /api/v1/enrollments/:enrollmentId/progress)
    // =========================================================================
    const progress2Res = await request(app)
      .patch(`/api/v1/enrollments/${enrollmentId}/progress`)
      .set('Authorization', `Bearer ${traineeToken}`)
      .send({ lessonId: '102' });

    expect(progress2Res.status).toBe(200);
    expect(progress2Res.body.success).toBe(true);
    expect(progress2Res.body.data).toMatchObject({
      enrollmentId: '500',
      courseId: '1',
      lessonId: '102',
      completed: true,
      completedLessons: 2,
      totalLessons: 2,
      progressPercentage: 100,
      isComplete: true,
      status: 'COMPLETED',
    });

    // =========================================================================
    // 11. Trainee retrieves their enrollments -> progressPercentage shows 100%
    //     (GET /api/v1/enrollments/me)
    // =========================================================================
    const myEnrollmentsRes = await request(app)
      .get('/api/v1/enrollments/me')
      .set('Authorization', `Bearer ${traineeToken}`);

    expect(myEnrollmentsRes.status).toBe(200);
    expect(myEnrollmentsRes.body.success).toBe(true);
    const myEnrollments = myEnrollmentsRes.body.data.enrollments;
    expect(myEnrollments).toHaveLength(1);
    expect(myEnrollments[0]).toMatchObject({
      id: '500',
      traineeId: '20',
      courseId: '1',
      status: 'COMPLETED',
      progressPercentage: 100,
      completedLessons: 2,
      totalLessons: 2,
      courseTitle: 'Cloud-Native Enterprise Architecture',
    });
  });
});
