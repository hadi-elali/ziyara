import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { RequireAuth } from '@/features/auth/RequireAuth';

export default function AdminScreen() {
  return (
    <RequireAuth admin returnTo="/admin">
      <AdminDashboard />
    </RequireAuth>
  );
}
