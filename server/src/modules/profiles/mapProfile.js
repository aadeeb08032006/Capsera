export function mapTraineeProfile(row) {
  if (!row) return null;

  return {
    id: String(row.id),
    userId: String(row.user_id),
    headline: row.headline ?? null,
    organization: row.organization ?? null,
    biography: row.biography ?? null,
    qualifications: row.qualifications ?? null,
    workExperience: row.work_experience ?? null,
    interests: row.interests ?? null,
    externalCertifications: row.external_certifications ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function mapTrainerProfile(row) {
  if (!row) return null;

  return {
    id: String(row.id),
    userId: String(row.user_id),
    headline: row.headline ?? null,
    organization: row.organization ?? null,
    biography: row.biography ?? null,
    qualifications: row.qualifications ?? null,
    workExperience: row.work_experience ?? null,
    subjectExpertise: row.subject_expertise ?? null,
    yearsOfExperience: Number(row.years_of_experience ?? 0),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
