export function mapUser(user) {
  const createdAt = user.created_at ?? user.createdAt;

  return {
    id: String(user.id),
    fullName: user.full_name ?? user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: new Date(createdAt).toISOString(),
  };
}
