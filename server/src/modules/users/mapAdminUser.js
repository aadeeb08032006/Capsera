export function mapAdminUser(user) {
  const createdAt = user.created_at ?? user.createdAt;
  const approvedAt = user.approved_at ?? user.approvedAt;
  const approvedBy = user.approved_by ?? user.approvedBy;

  return {
    id: String(user.id),
    fullName: user.full_name ?? user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    approvedBy: approvedBy != null ? String(approvedBy) : null,
    approvedAt: approvedAt != null ? new Date(approvedAt).toISOString() : null,
    createdAt: createdAt != null ? new Date(createdAt).toISOString() : new Date().toISOString(),
  };
}
