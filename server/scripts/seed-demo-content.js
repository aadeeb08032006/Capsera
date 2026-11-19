/**
 * Idempotent demo content seeder for the dedicated `capsera_demo` database.
 *
 * Uses CAPSERA's actual domain services so courses, lessons, resources,
 * assessments, attempts, progress, certificates, audit logs, competency
 * mappings, and announcements follow real business rules.
 *
 * Usage:
 *   DATABASE_URL="" NODE_ENV=development DB_NAME=capsera_demo node server/scripts/seed-demo-content.js
 */

import '../src/config/env.js';
import { executeQuery, pool } from '../src/config/db.js';
import {
  createSkill,
  replaceMyTraineeSkills,
  replaceMyTrainerSkills,
} from '../src/modules/competency/skills.service.js';
import {
  createCourse,
  publishCourse,
} from '../src/modules/courses/course.service.js';
import { createLesson } from '../src/modules/courses/lesson.service.js';
import { createCourseResource } from '../src/modules/courses/resource.service.js';
import {
  enrollInCourse,
  markLessonComplete,
} from '../src/modules/enrollments/enrollment.service.js';
import {
  createAssessment,
  createQuestion,
  publishAssessment,
  startAttempt,
  submitAttempt,
  upsertCourseFeedback,
} from '../src/modules/assessments/assessment.service.js';
import { createAnnouncement } from '../src/modules/announcements/announcements.service.js';

const ALLOWED_DEMO_DB = 'capsera_demo';

const CANONICAL_SKILLS = [
  { name: 'Weather Forecasting', category: 'Meteorology' },
  { name: 'Python for Meteorological Data', category: 'Data Science' },
  { name: 'Data Visualization', category: 'Data Science' },
  { name: 'Remote Sensing Fundamentals', category: 'Earth Observation' },
  { name: 'Climate Data Analysis', category: 'Climate Science' },
];

const DEMO_ANNOUNCEMENTS = [
  {
    title: 'Welcome to the CAPSERA Capacity Building Portal',
    category: 'ANNOUNCEMENT',
    body: 'Explore structured self-paced courses, interactive MCQ assessments, and deterministic trainer recommendations to strengthen organizational technical competencies.',
  },
  {
    title: 'New Course Available: Weather Data Analysis with Python',
    category: 'NEW_CONTENT',
    body: 'Demo Trainer Two has published a hands-on intermediate training track covering tabular weather observation parsing, missing-value cleaning, and daily anomaly computation.',
  },
  {
    title: 'First Completion Certificates Issued on CAPSERA',
    category: 'ACHIEVEMENT',
    body: 'Learners who complete all course lessons and pass required assessments automatically receive verifiable completion certificates with unique verification codes.',
  },
];

async function findUserByEmail(email) {
  const res = await executeQuery(
    'SELECT id, full_name, email, role, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email],
  );
  if (!res.rows.length) {
    throw new Error(`Required seeded user not found: ${email}. Run seed:admin and seed:demo first.`);
  }
  const row = res.rows[0];
  return {
    id: String(row.id),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
  };
}

async function ensureSkill({ name, category }) {
  const existing = await executeQuery(
    'SELECT id, name, category FROM skills WHERE LOWER(name) = LOWER($1) LIMIT 1',
    [name],
  );
  if (existing.rows.length > 0) {
    return {
      id: String(existing.rows[0].id),
      name: existing.rows[0].name,
      category: existing.rows[0].category,
    };
  }
  return createSkill({ name, category });
}

async function ensureCourse(actor, spec) {
  const existing = await executeQuery(
    'SELECT id, title, status FROM courses WHERE trainer_id = $1 AND title = $2 LIMIT 1',
    [actor.id, spec.title],
  );
  let courseId;
  let status;
  if (existing.rows.length > 0) {
    courseId = String(existing.rows[0].id);
    status = existing.rows[0].status;
  } else {
    const created = await createCourse(
      {
        title: spec.title,
        summary: spec.summary,
        description: spec.description,
        subject: spec.subject,
        level: spec.level,
      },
      actor,
    );
    courseId = String(created.id);
    status = created.status;
  }

  // Ensure ordered lessons
  const lessonIds = [];
  for (const lessonSpec of spec.lessons) {
    const existingLesson = await executeQuery(
      'SELECT id FROM lessons WHERE course_id = $1 AND title = $2 LIMIT 1',
      [courseId, lessonSpec.title],
    );
    if (existingLesson.rows.length > 0) {
      lessonIds.push(String(existingLesson.rows[0].id));
    } else {
      const createdLesson = await createLesson(courseId, lessonSpec, actor);
      lessonIds.push(String(createdLesson.id));
    }
  }

  // Ensure study resources (external reference links)
  for (const resSpec of spec.resources || []) {
    const existingRes = await executeQuery(
      'SELECT id FROM learning_resources WHERE course_id = $1 AND title = $2 LIMIT 1',
      [courseId, resSpec.title],
    );
    if (existingRes.rows.length === 0) {
      await createCourseResource(
        courseId,
        {
          title: resSpec.title,
          description: resSpec.description,
          resourceType: 'LINK',
          externalUrl: resSpec.externalUrl,
          lessonId: resSpec.lessonIndex != null ? lessonIds[resSpec.lessonIndex] : null,
        },
        null,
        actor,
      );
    }
  }

  // Publish course if requested and still DRAFT
  if (spec.publish && status === 'DRAFT') {
    await publishCourse(courseId, actor);
    status = 'PUBLISHED';
  }

  // Ensure assessment & questions
  let assessmentId = null;
  if (spec.assessment) {
    const existingAssess = await executeQuery(
      'SELECT id, status FROM assessments WHERE course_id = $1 AND title = $2 LIMIT 1',
      [courseId, spec.assessment.title],
    );
    let assessStatus;
    if (existingAssess.rows.length > 0) {
      assessmentId = String(existingAssess.rows[0].id);
      assessStatus = existingAssess.rows[0].status;
    } else {
      const createdAssess = await createAssessment(
        courseId,
        {
          title: spec.assessment.title,
          instructions: spec.assessment.instructions,
          durationMinutes: spec.assessment.durationMinutes,
          maxAttempts: spec.assessment.maxAttempts,
          passPercentage: spec.assessment.passPercentage,
          isRequired: spec.assessment.isRequired,
        },
        actor,
      );
      assessmentId = String(createdAssess.id);
      assessStatus = createdAssess.status;
    }

    for (const qSpec of spec.assessment.questions) {
      const existingQ = await executeQuery(
        'SELECT id FROM questions WHERE assessment_id = $1 AND question_text = $2 LIMIT 1',
        [assessmentId, qSpec.questionText],
      );
      if (existingQ.rows.length === 0) {
        await createQuestion(assessmentId, qSpec, actor);
      }
    }

    if (spec.assessment.publish && assessStatus === 'DRAFT') {
      await publishAssessment(assessmentId, actor);
    }
  }

  return { courseId, lessonIds, assessmentId, status };
}

async function ensureEnrollment(courseId, trainee) {
  const existing = await executeQuery(
    'SELECT id, status FROM enrollments WHERE course_id = $1 AND trainee_id = $2 LIMIT 1',
    [courseId, trainee.id],
  );
  if (existing.rows.length > 0) {
    return { id: String(existing.rows[0].id), status: existing.rows[0].status };
  }
  const enrolled = await enrollInCourse(courseId, trainee);
  return { id: String(enrolled.id), status: enrolled.status };
}

async function ensurePassedAttempt(assessmentId, trainee, correctAnswersByOrder) {
  const existing = await executeQuery(
    `SELECT id, is_passed FROM assessment_attempts
     WHERE assessment_id = $1 AND trainee_id = $2 AND status = 'GRADED' AND is_passed = TRUE
     LIMIT 1`,
    [assessmentId, trainee.id],
  );
  if (existing.rows.length > 0) {
    return { alreadyPassed: true, attemptId: String(existing.rows[0].id) };
  }

  const started = await startAttempt(assessmentId, trainee);
  const answers = started.questions.map((q, idx) => ({
    questionId: String(q.id),
    selectedOption: correctAnswersByOrder[idx] || 'A',
  }));
  const graded = await submitAttempt(started.attempt.id, { answers }, trainee);
  return { alreadyPassed: false, attemptId: String(graded.attempt.id), isPassed: graded.attempt.isPassed };
}

async function ensureAnnouncement(adminActor, spec) {
  const existing = await executeQuery(
    'SELECT id FROM announcements WHERE title = $1 LIMIT 1',
    [spec.title],
  );
  if (existing.rows.length > 0) {
    return String(existing.rows[0].id);
  }
  const created = await createAnnouncement(adminActor.id, {
    title: spec.title,
    body: spec.body,
    category: spec.category,
    status: 'PUBLISHED',
  });
  return String(created.id);
}

const INITIAL_SKILL_ROLE_CONFIG = {
  TRAINER: {
    checkSql: 'SELECT 1 FROM trainer_skills WHERE trainer_id = $1 LIMIT 1',
    replaceFn: replaceMyTrainerSkills,
  },
  TRAINEE: {
    checkSql: 'SELECT 1 FROM trainee_skills WHERE trainee_id = $1 LIMIT 1',
    replaceFn: replaceMyTraineeSkills,
  },
};

/**
 * Seed initial competency mappings ONLY when the user currently has zero mapped skills,
 * preserving user edits or additions on subsequent reruns.
 */
async function ensureInitialSkillsIfEmpty(roleKey, userId, skills) {
  const config = INITIAL_SKILL_ROLE_CONFIG[roleKey];
  if (!config) {
    throw new Error(`Unsupported skill seeding role: ${roleKey}`);
  }
  const existing = await executeQuery(config.checkSql, [userId]);
  if (existing.rows.length > 0) {
    return false;
  }
  await config.replaceFn(userId, skills);
  return true;
}

/**
 * Record lesson completion ONLY when the enrollment is not cancelled and the lesson is not yet recorded.
 */
async function ensureLessonCompleted(enrollment, lessonId, trainee) {
  if (enrollment.status === 'CANCELLED') {
    return false;
  }
  const existing = await executeQuery(
    'SELECT 1 FROM lesson_progress WHERE enrollment_id = $1 AND lesson_id = $2 LIMIT 1',
    [enrollment.id, lessonId],
  );
  if (existing.rows.length > 0) {
    return false;
  }
  await markLessonComplete(enrollment.id, lessonId, trainee);
  return true;
}

/**
 * Seed initial course feedback ONLY if the trainee has not already submitted feedback for the course,
 * preserving existing ratings and review comments on reruns.
 */
async function ensureCourseFeedback(courseId, payload, trainee) {
  const existing = await executeQuery(
    'SELECT id FROM feedback WHERE course_id = $1 AND trainee_id = $2 LIMIT 1',
    [courseId, trainee.id],
  );
  if (existing.rows.length > 0) {
    return String(existing.rows[0].id);
  }
  const result = await upsertCourseFeedback(courseId, payload, trainee);
  return String(result.feedback?.id ?? '');
}

export async function seedDemoContent() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Demo content seeding is disabled when NODE_ENV=production');
  }

  const dbCheck = await executeQuery('SELECT current_database() AS db');
  const activeDb = dbCheck.rows[0]?.db;
  if (activeDb !== ALLOWED_DEMO_DB) {
    throw new Error(
      `Refusing to seed demo content into "${activeDb}". Explicitly target "${ALLOWED_DEMO_DB}".`,
    );
  }

  const admin = await findUserByEmail(process.env.ADMIN_EMAIL || 'admin@example.com');
  const trainer1 = await findUserByEmail('demo-trainer-1@example.com');
  const trainer2 = await findUserByEmail('demo-trainer-2@example.com');
  const trainee1 = await findUserByEmail('demo-trainee-1@example.com');
  const trainee2 = await findUserByEmail('demo-trainee-2@example.com');
  const trainee3 = await findUserByEmail('demo-trainee-3@example.com');

  // 1. Canonical skills
  const skillMap = {};
  for (const s of CANONICAL_SKILLS) {
    const ensured = await ensureSkill(s);
    skillMap[s.name] = ensured;
  }

  // 2. Trainer & trainee competency mappings (seeded non-destructively only if empty)
  await ensureInitialSkillsIfEmpty('TRAINER', trainer1.id, [
    { skillId: skillMap['Weather Forecasting'].id, proficiency: 4, yearsOfExperience: 8.5 },
    { skillId: skillMap['Remote Sensing Fundamentals'].id, proficiency: 4, yearsOfExperience: 6.0 },
    { skillId: skillMap['Climate Data Analysis'].id, proficiency: 3, yearsOfExperience: 4.0 },
  ]);

  await ensureInitialSkillsIfEmpty('TRAINER', trainer2.id, [
    { skillId: skillMap['Python for Meteorological Data'].id, proficiency: 4, yearsOfExperience: 6.0 },
    { skillId: skillMap['Data Visualization'].id, proficiency: 4, yearsOfExperience: 5.5 },
    { skillId: skillMap['Climate Data Analysis'].id, proficiency: 4, yearsOfExperience: 4.5 },
    { skillId: skillMap['Weather Forecasting'].id, proficiency: 3, yearsOfExperience: 2.5 },
  ]);

  await ensureInitialSkillsIfEmpty('TRAINEE', trainee1.id, [
    { skillId: skillMap['Python for Meteorological Data'].id, proficiency: 2 },
    { skillId: skillMap['Data Visualization'].id, proficiency: 2 },
  ]);

  await ensureInitialSkillsIfEmpty('TRAINEE', trainee2.id, [
    { skillId: skillMap['Weather Forecasting'].id, proficiency: 2 },
    { skillId: skillMap['Climate Data Analysis'].id, proficiency: 1 },
  ]);

  // 3. Courses (Course A published for live enrollment by Demo Trainee One + partial progress by Demo Trainee Two)
  const courseA = await ensureCourse(trainer2, {
    title: 'Weather Data Analysis with Python',
    summary: 'Learn practical Python workflows for parsing, cleaning, and analyzing synthetic surface weather observations.',
    description:
      'This synthetic intermediate training course introduces structured workflows for working with tabular meteorological observation files in Python. Learners practice validating timestamps, handling missing station records, and computing daily temperature and rainfall anomalies.',
    subject: 'Data Science',
    level: 'INTERMEDIATE',
    publish: true,
    lessons: [
      {
        title: 'Loading Surface Observation CSV Datasets',
        estimatedDurationMinutes: 15,
        content:
          'Surface observation archives are commonly distributed as comma-separated text files containing station identifiers, UTC timestamps, air temperature, pressure, and rainfall totals.\n\nIn this lesson, review standard column naming conventions, explicit UTC timestamp parsing, and schema validation checks before running summary calculations.',
      },
      {
        title: 'Cleaning Missing Station Measurements with Pandas',
        estimatedDurationMinutes: 20,
        content:
          'Automated weather stations periodically report sentinel values such as -999 or blank fields during sensor maintenance.\n\nReplace sentinel values with NaN prior to aggregation, document quality flags, and verify how missing-hour gaps affect daily means.',
      },
      {
        title: 'Computing Daily Temperature and Rainfall Anomalies',
        estimatedDurationMinutes: 25,
        content:
          'An anomaly measures the departure of an observed value from a baseline climatological average.\n\nGroup validated daily observations by calendar month, compute baseline means across the reference period, and inspect positive and negative deviations.',
      },
    ],
    resources: [
      {
        title: 'Pandas Time-Series User Guide',
        description: 'Reference documentation on date parsing, resampling, and rolling windows.',
        externalUrl: 'https://pandas.pydata.org/docs/user_guide/timeseries.html',
        lessonIndex: 0,
      },
      {
        title: 'Python CSV Module Documentation',
        description: 'Official Python standard library reference for tabular text parsing.',
        externalUrl: 'https://docs.python.org/3/library/csv.html',
        lessonIndex: 1,
      },
    ],
    assessment: {
      title: 'Python Weather Data Proficiency Check',
      instructions: 'Answer all three multiple-choice questions within 15 minutes. A minimum score of 60% is required to pass.',
      durationMinutes: 15,
      maxAttempts: 3,
      passPercentage: 60,
      isRequired: true,
      publish: true,
      questions: [
        {
          questionText: 'Why should sentinel values like -999 be converted to missing values (NaN) before averaging station temperatures?',
          optionA: 'Sentinel numbers bias the calculated mean if treated as valid readings',
          optionB: 'CSV files cannot store negative numbers',
          optionC: 'Python automatically drops all negative values',
          optionD: 'Timestamps cannot be parsed when negative numbers exist',
          correctOption: 'A',
          points: 1,
          explanation: 'Treating placeholder sentinel codes as numeric observations severely distorts averages and anomaly calculations.',
        },
        {
          questionText: 'What does a daily temperature anomaly represent?',
          optionA: 'The raw maximum temperature recorded at noon',
          optionB: 'The difference between an observed temperature and a reference baseline average',
          optionC: 'The total number of missing hours in a month',
          optionD: 'The altitude of the observing station',
          correctOption: 'B',
          points: 1,
          explanation: 'Anomalies express departure from a baseline climatological average rather than an absolute reading.',
        },
        {
          questionText: 'Which timestamp convention avoids ambiguity across regional observing stations?',
          optionA: 'Local wall-clock time without timezone offset',
          optionB: 'Day-of-week names only',
          optionC: 'Coordinated Universal Time (UTC) in ISO 8601 format',
          optionD: 'Sequential row numbers',
          correctOption: 'C',
          points: 1,
          explanation: 'UTC ISO 8601 timestamps keep multi-station records aligned without daylight-saving or timezone drift.',
        },
      ],
    },
  });

  // Course B: Published + completed end-to-end by Demo Trainee Three with auto-issued certificate
  const courseB = await ensureCourse(trainer1, {
    title: 'Introduction to Weather Forecasting',
    summary: 'Foundational concepts in atmospheric pressure analysis, surface weather charts, and short-range forecast communication.',
    description:
      'A synthetic beginner-level training track introducing core principles of synoptic meteorology. Participants learn how isobars relate to wind speed, how frontal boundaries appear on surface maps, and how to communicate forecast uncertainty clearly.',
    subject: 'Meteorology',
    level: 'BEGINNER',
    publish: true,
    lessons: [
      {
        title: 'Atmospheric Pressure Systems and Isobars',
        estimatedDurationMinutes: 15,
        content:
          'Isobars connect points of equal mean sea-level pressure on a weather map.\n\nClosely spaced isobars indicate a steep pressure gradient and stronger surface winds, while widely spaced isobars correspond to lighter winds.',
      },
      {
        title: 'Reading Synoptic Surface Charts',
        estimatedDurationMinutes: 20,
        content:
          'Synoptic charts summarize simultaneous observations of pressure, wind barbs, temperature, and frontal systems.\n\nIdentifying low-pressure troughs and high-pressure ridges helps forecasters anticipate cloud development and precipitation zones.',
      },
      {
        title: 'Short-Range Forecast Interpretation and Uncertainty',
        estimatedDurationMinutes: 20,
        content:
          'Clear forecast briefings distinguish high-confidence patterns from localized convective uncertainty.\n\nAlways pair expected conditions with valid time windows and plain-language decision guidance.',
      },
    ],
    resources: [
      {
        title: 'WMO Public Weather Services Overview',
        description: 'General reference material on weather communication concepts.',
        externalUrl: 'https://public.wmo.int/en',
        lessonIndex: 0,
      },
      {
        title: 'NOAA JetStream Online School for Weather',
        description: 'Open educational introduction to synoptic charts and atmospheric dynamics.',
        externalUrl: 'https://www.noaa.gov/jetstream',
        lessonIndex: 1,
      },
    ],
    assessment: {
      title: 'Weather Forecasting Fundamentals Quiz',
      instructions: 'Untimed assessment covering pressure gradients, synoptic maps, and forecast communication. Minimum passing score: 60%.',
      durationMinutes: null,
      maxAttempts: 3,
      passPercentage: 60,
      isRequired: true,
      publish: true,
      questions: [
        {
          questionText: 'What do closely spaced isobars on a surface weather chart typically indicate?',
          optionA: 'A steep pressure gradient and stronger winds',
          optionB: 'Zero wind speed across the region',
          optionC: 'Sensor calibration errors',
          optionD: 'Constant humidity at all altitudes',
          correctOption: 'A',
          points: 1,
          explanation: 'Tighter isobar spacing signifies a stronger horizontal pressure gradient force, producing faster winds.',
        },
        {
          questionText: 'What is the primary purpose of a synoptic surface chart?',
          optionA: 'To summarize simultaneous weather observations across a broad area',
          optionB: 'To replace all numerical weather prediction models',
          optionC: 'To measure soil mineral content',
          optionD: 'To store long-term paleoclimate ice cores',
          correctOption: 'A',
          points: 1,
          explanation: 'Synoptic charts plot concurrent observations across stations to reveal large-scale weather systems.',
        },
        {
          questionText: 'Which practice improves operational short-range forecast briefings?',
          optionA: 'Omitting valid time windows',
          optionB: 'Communicating expected conditions alongside timing and uncertainty',
          optionC: 'Reporting only single-station raw codes',
          optionD: 'Avoiding plain-language summaries',
          correctOption: 'B',
          points: 1,
          explanation: 'Pairing expected weather with clear valid windows and confidence levels supports sound decision-making.',
        },
      ],
    },
  });

  // Course C: Draft course for Trainer authoring / publish demonstration
  await ensureCourse(trainer2, {
    title: 'Visualizing Climate Trends',
    summary: 'Design clear time-series charts, anomaly heatmaps, and multi-station comparisons for technical reports.',
    description:
      'A synthetic draft course demonstrating trainer curriculum authoring before publication. Covers perceptually uniform color scales, clear axis labeling, and reproducible plotting templates.',
    subject: 'Climate Science',
    level: 'INTERMEDIATE',
    publish: false,
    lessons: [
      {
        title: 'Choosing Perceptually Uniform Color Scales',
        estimatedDurationMinutes: 15,
        content:
          'Avoid rainbow colormaps when plotting temperature or precipitation anomalies because uneven luminance creates false visual boundaries.\n\nUse diverging palettes centered on zero for anomalies and sequential palettes for rainfall totals.',
      },
      {
        title: 'Annotating Multi-Decade Time-Series Figures',
        estimatedDurationMinutes: 20,
        content:
          'Every technical chart should state units, baseline reference periods, smoothing windows, and data-source notes directly in titles or captions.',
      },
    ],
    resources: [
      {
        title: 'Matplotlib Colormap Reference',
        description: 'Guide to sequential and diverging perceptually uniform palettes.',
        externalUrl: 'https://matplotlib.org/stable/users/explain/colors/colormaps.html',
        lessonIndex: 0,
      },
    ],
  });

  // 4. Enrollment & progress states through actual domain services (non-destructive on reruns)
  // Demo Trainee Two -> partial progress on Course A (Lesson 1 of 3 complete = 33%)
  const t2CourseA = await ensureEnrollment(courseA.courseId, trainee2);
  await ensureLessonCompleted(t2CourseA, courseA.lessonIds[0], trainee2);

  // Demo Trainee Three -> full completion on Course B + real auto-issued certificate + feedback
  const t3CourseB = await ensureEnrollment(courseB.courseId, trainee3);
  for (const lid of courseB.lessonIds) {
    await ensureLessonCompleted(t3CourseB, lid, trainee3);
  }
  await ensurePassedAttempt(courseB.assessmentId, trainee3, ['A', 'A', 'B']);
  await ensureCourseFeedback(
    courseB.courseId,
    {
      rating: 5,
      comment: 'Clear explanations of isobars and surface charts with practical review questions.',
    },
    trainee3,
  );

  // 5. Published homepage announcements
  for (const ann of DEMO_ANNOUNCEMENTS) {
    await ensureAnnouncement(admin, ann);
  }

  // Gather summary counts from PostgreSQL
  const countsRes = await executeQuery(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM skills) AS skills,
      (SELECT COUNT(*)::int FROM courses) AS courses,
      (SELECT COUNT(*)::int FROM lessons) AS lessons,
      (SELECT COUNT(*)::int FROM learning_resources) AS resources,
      (SELECT COUNT(*)::int FROM assessments) AS assessments,
      (SELECT COUNT(*)::int FROM questions) AS questions,
      (SELECT COUNT(*)::int FROM enrollments) AS enrollments,
      (SELECT COUNT(*)::int FROM certificates) AS certificates,
      (SELECT COUNT(*)::int FROM announcements) AS announcements
  `);

  const certRes = await executeQuery(
    `SELECT c.certificate_code, u.email AS trainee_email, co.title AS course_title
     FROM certificates c
     JOIN users u ON u.id = c.trainee_id
     JOIN courses co ON co.id = c.course_id
     ORDER BY c.id ASC`,
  );

  return {
    database: activeDb,
    counts: countsRes.rows[0],
    certificates: certRes.rows,
  };
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('seed-demo-content.js') ||
    process.argv[1].endsWith('seed-demo-content'));

if (isDirectRun) {
  seedDemoContent()
    .then(async (summary) => {
      console.log('[seed-demo-content] Completed successfully:');
      console.log(JSON.stringify(summary, null, 2));
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(`[seed-demo-content] Error: ${err.message}`);
      await pool.end();
      process.exit(1);
    });
}
