import { executeQuery } from '../../config/db.js';
import { mapTraineeProfile, mapTrainerProfile } from './mapProfile.js';

export async function getProfile(user) {
  const userSummary = {
    id: String(user.id),
    fullName: user.fullName ?? user.full_name,
    email: user.email,
    role: user.role,
  };

  if (user.role === 'ADMIN') {
    return {
      user: userSummary,
      profile: null,
    };
  }

  if (user.role === 'TRAINEE') {
    const result = await executeQuery(
      `SELECT id, user_id, headline, organization, biography, qualifications, work_experience, interests, external_certifications, created_at, updated_at
       FROM trainee_profiles
       WHERE user_id = $1`,
      [user.id],
    );

    const profile = result.rows[0] ? mapTraineeProfile(result.rows[0]) : null;

    return {
      user: userSummary,
      profile,
    };
  }

  if (user.role === 'TRAINER') {
    const result = await executeQuery(
      `SELECT id, user_id, headline, organization, biography, qualifications, work_experience, subject_expertise, years_of_experience, created_at, updated_at
       FROM trainer_profiles
       WHERE user_id = $1`,
      [user.id],
    );

    const profile = result.rows[0] ? mapTrainerProfile(result.rows[0]) : null;

    return {
      user: userSummary,
      profile,
    };
  }

  return {
    user: userSummary,
    profile: null,
  };
}

export async function upsertTraineeProfile(userId, data) {
  const result = await executeQuery(
    `INSERT INTO trainee_profiles (
       user_id,
       headline,
       organization,
       biography,
       qualifications,
       work_experience,
       interests,
       external_certifications
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
       updated_at = CURRENT_TIMESTAMP
     RETURNING
       id,
       user_id,
       headline,
       organization,
       biography,
       qualifications,
       work_experience,
       interests,
       external_certifications,
       created_at,
       updated_at`,
    [
      userId,
      data.headline,
      data.organization,
      data.biography,
      data.qualifications,
      data.workExperience,
      data.interests,
      data.externalCertifications,
    ],
  );

  return {
    profile: mapTraineeProfile(result.rows[0]),
  };
}

export async function upsertTrainerProfile(userId, data) {
  const result = await executeQuery(
    `INSERT INTO trainer_profiles (
       user_id,
       headline,
       organization,
       biography,
       qualifications,
       work_experience,
       subject_expertise,
       years_of_experience
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
       updated_at = CURRENT_TIMESTAMP
     RETURNING
       id,
       user_id,
       headline,
       organization,
       biography,
       qualifications,
       work_experience,
       subject_expertise,
       years_of_experience,
       created_at,
       updated_at`,
    [
      userId,
      data.headline,
      data.organization,
      data.biography,
      data.qualifications,
      data.workExperience,
      data.subjectExpertise,
      data.yearsOfExperience,
    ],
  );

  return {
    profile: mapTrainerProfile(result.rows[0]),
  };
}
