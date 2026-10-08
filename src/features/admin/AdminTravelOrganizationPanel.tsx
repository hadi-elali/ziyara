import type { AccountFamily, AdminUserSummary } from '@/domain/database';
import { AdminTripGroupPanel } from '@/features/trip-groups/AdminTripGroupPanel';

export function AdminTravelOrganizationPanel({ families, users }: { families: AccountFamily[]; users: AdminUserSummary[] }) {
  return <AdminTripGroupPanel families={families} users={users} />;
}
