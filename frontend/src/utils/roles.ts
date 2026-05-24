/** User has superadmin powers (sees all data, full system access) */
export function isSuperAdmin(user: { role?: string; username?: string } | null | undefined): boolean {
  if (!user) return false;
  return (
    user.role === 'superadmin' ||
    user.username?.toLowerCase() === 'admin' ||
    user.username?.toLowerCase() === 'adminhub'
  );
}

/** User can access the /admin menu (admin or superadmin) */
export function isAdminLike(user: { role?: string; username?: string } | null | undefined): boolean {
  if (!user) return false;
  return isSuperAdmin(user) || user.role === 'admin';
}
