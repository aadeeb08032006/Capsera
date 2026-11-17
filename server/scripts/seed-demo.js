import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { passwordSchema } from '../src/modules/auth/auth.validation.js';
import { pool, withTransaction } from '../src/config/db.js';

const DEMO_USERS = [
  {
    fullName: 'Demo Trainee One', email: 'demo-trainee-1@example.com', role: 'TRAINEE', status: 'ACTIVE',
    profile: { headline: 'Early-career analyst', organization: 'Example Research Group', biography: 'Interested in weather data and public service.', qualifications: 'B.Sc. Statistics', workExperience: 'Data assistant', interests: 'Climate data, visualization', externalCertifications: 'Example Data Foundations' },
  },
  {
    fullName: 'Demo Trainee Two', email: 'demo-trainee-2@example.com', role: 'TRAINEE', status: 'ACTIVE',
    profile: { headline: 'Learning coordinator', organization: 'Example Learning Lab', biography: 'Focused on accessible learning programs.', qualifications: 'M.A. Education', workExperience: 'Training coordinator', interests: 'Instructional design', externalCertifications: 'Example Learning Design' },
  },
  {
    fullName: 'Demo Trainee Three', email: 'demo-trainee-3@example.com', role: 'TRAINEE', status: 'ACTIVE',
    profile: { headline: 'Environmental researcher', organization: 'Example Field Institute', biography: 'Works with community observations and local datasets.', qualifications: 'M.Sc. Environmental Science', workExperience: 'Research associate', interests: 'Remote sensing, field methods', externalCertifications: 'Example GIS Basics' },
  },
  {
    fullName: 'Demo Trainer One', email: 'demo-trainer-1@example.com', role: 'TRAINER', status: 'ACTIVE',
    profile: { headline: 'Applied meteorology instructor', organization: 'Example Weather Center', biography: 'Teaches forecasting fundamentals and operational tools.', qualifications: 'M.Sc. Atmospheric Science', workExperience: 'Forecasting instructor', subjectExpertise: 'Weather forecasting, synoptic meteorology', yearsOfExperience: 8.5 },
  },
  {
    fullName: 'Demo Trainer Two', email: 'demo-trainer-2@example.com', role: 'TRAINER', status: 'ACTIVE',
    profile: { headline: 'Data skills instructor', organization: 'Example Learning Lab', biography: 'Helps teams build practical data analysis skills.', qualifications: 'M.Sc. Data Science', workExperience: 'Data science educator', subjectExpertise: 'Python, data visualization', yearsOfExperience: 6.0 },
  },
  { fullName: 'Demo Pending Trainee', email: 'demo-pending-trainee@example.com', role: 'TRAINEE', status: 'PENDING' },
  { fullName: 'Demo Pending Trainer', email: 'demo-pending-trainer@example.com', role: 'TRAINER', status: 'PENDING' },
  { fullName: 'Demo Rejected User', email: 'demo-rejected@example.com', role: 'TRAINEE', status: 'REJECTED' },
  { fullName: 'Demo Suspended Trainer', email: 'demo-suspended@example.com', role: 'TRAINER', status: 'SUSPENDED' },
];

export async function seedDemo() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Demo seeding is disabled when NODE_ENV=production');
  }

  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword) throw new Error('DEMO_PASSWORD is required to seed demo users');
  if (!passwordSchema.safeParse(demoPassword).success) {
    throw new Error('DEMO_PASSWORD must meet the signup password policy');
  }

  const passwordHash = await bcrypt.hash(demoPassword, env.bcryptCost);

  return withTransaction(async (client) => {
    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    let adminId = null;
    if (adminEmail) {
      const adminResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(email) = LOWER($1) AND role = 'ADMIN'
         LIMIT 1`,
        [adminEmail],
      );
      adminId = adminResult.rows[0]?.id ?? null;
    }

    for (const demoUser of DEMO_USERS) {
      const approved = demoUser.status === 'ACTIVE' || demoUser.status === 'SUSPENDED';
      let result = await client.query(
        `INSERT INTO users (
           full_name, email, password_hash, role, status, approved_by, approved_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN CURRENT_TIMESTAMP ELSE NULL END)
         ON CONFLICT (LOWER(email)) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           status = EXCLUDED.status,
           approved_by = EXCLUDED.approved_by,
           approved_at = EXCLUDED.approved_at,
           updated_at = CURRENT_TIMESTAMP
         WHERE users.role <> 'ADMIN'
         RETURNING id, role, status`,
        [
          demoUser.fullName,
          demoUser.email,
          passwordHash,
          demoUser.role,
          demoUser.status,
          approved ? adminId : null,
          approved,
        ],
      );

      let user = result.rows[0];
      if (!user) {
        result = await client.query(
          'SELECT id, role, status FROM users WHERE LOWER(email) = LOWER($1)',
          [demoUser.email],
        );
        user = result.rows[0];
      }
      if (!user || user.role === 'ADMIN') {
        throw new Error(`Demo account email is reserved by a different account: ${demoUser.email}`);
      }

      if (!demoUser.profile) continue;
      if (demoUser.role === 'TRAINEE') {
        await client.query(
          `INSERT INTO trainee_profiles (
             user_id, headline, organization, biography, qualifications,
             work_experience, interests, external_certifications
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id) DO UPDATE SET
             headline = EXCLUDED.headline,
             organization = EXCLUDED.organization,
             biography = EXCLUDED.biography,
             qualifications = EXCLUDED.qualifications,
             work_experience = EXCLUDED.work_experience,
             interests = EXCLUDED.interests,
             external_certifications = EXCLUDED.external_certifications,
             updated_at = CURRENT_TIMESTAMP`,
          [
            user.id,
            demoUser.profile.headline,
            demoUser.profile.organization,
            demoUser.profile.biography,
            demoUser.profile.qualifications,
            demoUser.profile.workExperience,
            demoUser.profile.interests,
            demoUser.profile.externalCertifications,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO trainer_profiles (
             user_id, headline, organization, biography, qualifications,
             work_experience, subject_expertise, years_of_experience
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id) DO UPDATE SET
             headline = EXCLUDED.headline,
             organization = EXCLUDED.organization,
             biography = EXCLUDED.biography,
             qualifications = EXCLUDED.qualifications,
             work_experience = EXCLUDED.work_experience,
             subject_expertise = EXCLUDED.subject_expertise,
             years_of_experience = EXCLUDED.years_of_experience,
             updated_at = CURRENT_TIMESTAMP`,
          [
            user.id,
            demoUser.profile.headline,
            demoUser.profile.organization,
            demoUser.profile.biography,
            demoUser.profile.qualifications,
            demoUser.profile.workExperience,
            demoUser.profile.subjectExpertise,
            demoUser.profile.yearsOfExperience,
          ],
        );
      }
    }

    return { userCount: DEMO_USERS.length };
  });
}

const isDirectRun = process.argv[1] && (process.argv[1].endsWith('seed-demo.js') || process.argv[1].endsWith('seed-demo'));

if (isDirectRun) {
  seedDemo()
    .then(async ({ userCount }) => {
      console.log(`[seed-demo] Seeded ${userCount} synthetic demo accounts.`);
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(`[seed-demo] ${error.message}`);
      await pool.end();
      process.exit(1);
    });
}