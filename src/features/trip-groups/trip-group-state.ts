import type {
  OrganizationGroup,
  OrganizationGroupLocationRequest,
  OrganizationGroupMember,
} from '@/domain/database';

export type TripGroupState = OrganizationGroup & {
  is_current_user_leader: boolean;
  is_current_user_member: boolean;
  leaders: OrganizationGroupMember[];
  location_requests: OrganizationGroupLocationRequest[];
  location_request: OrganizationGroupLocationRequest | null;
  members: OrganizationGroupMember[];
};

export type TripGroupMutationFailureKind =
  | 'auth'
  | 'conflict'
  | 'not_found'
  | 'offline'
  | 'server';

export function isCurrentLocationResponse(
  request: OrganizationGroupLocationRequest | null,
  now = new Date(),
) {
  if (
    !request || request.status === 'pending' || !request.location_expires_at
  ) {
    return false;
  }

  return new Date(request.location_expires_at).getTime() > now.getTime();
}

export function buildTripGroupStates(
  groups: OrganizationGroup[],
  members: OrganizationGroupMember[],
  locationRequests: OrganizationGroupLocationRequest[],
  userId: string | null,
): TripGroupState[] {
  const membersByGroup = new Map<number, OrganizationGroupMember[]>();

  for (const member of members) {
    const groupMembers = membersByGroup.get(member.group_id) ?? [];
    groupMembers.push(member);
    membersByGroup.set(member.group_id, groupMembers);
  }

  return [...groups]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((group) => {
      const groupMembers = membersByGroup.get(group.id) ?? [];
      return {
        ...group,
        is_current_user_leader: groupMembers.some((member) =>
          member.user_id === userId && member.is_leader
        ),
        is_current_user_member: groupMembers.some((member) =>
          member.user_id === userId
        ),
        leaders: groupMembers.filter((member) => member.is_leader),
        location_requests: locationRequests.filter((request) =>
          request.group_id === group.id
        ),
        location_request: locationRequests.find((request) =>
          request.group_id === group.id && request.leader_user_id === userId
        ) ?? null,
        members: groupMembers,
      };
    });
}

export function shouldRetryTripGroupMutationAfterSessionRefresh(
  error: unknown,
) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : '';

  return (
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    /permission denied for function (admin_save_organization_group|admin_delete_organization_group|admin_request_organization_group_location|respond_to_organization_group_location)/i
      .test(
        message,
      )
  );
}

export function getTripGroupMutationFailureKind(
  error: unknown,
): TripGroupMutationFailureKind {
  if (!error || typeof error !== 'object') return 'server';
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';
  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : '';

  if (
    shouldRetryTripGroupMutationAfterSessionRefresh(error) ||
    /admin access required|authentication required|user profile is required/i
      .test(message)
  ) {
    return 'auth';
  }
  if (code === '23505' || /only one trip group|must be unique/i.test(message)) {
    return 'conflict';
  }
  if (code === 'P0002' || /not found/i.test(message)) return 'not_found';
  if (/failed to fetch|fetch failed|load failed|network/i.test(message)) {
    return 'offline';
  }
  return 'server';
}
