export function mapUser(user) {
  const rawCreatedAt = user.created_at ?? user.createdAt;
  const createdAt = rawCreatedAt ? new Date(rawCreatedAt).toISOString() : new Date().toISOString();

  return {
    id: String(user.id),
    fullName: user.full_name ?? user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt,
  };
}
