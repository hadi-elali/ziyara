import type {
  TripGuidanceResponse,
  TripGuidanceStatus,
  TripParticipant,
} from '@/domain/database';

export type PendingTripGuidanceStatus = {
  guidanceId: number;
  participantId: number;
  queuedAt: string;
  status: TripGuidanceStatus;
  userId: string;
};

export type TripGuidanceParticipantState = TripParticipant & {
  isPending: boolean;
  response: TripGuidanceResponse | null;
  status: TripGuidanceStatus | null;
};

export type TripGuidanceSubmitFailureKind =
  | 'auth'
  | 'closed'
  | 'not_linked'
  | 'offline'
  | 'server';

const statuses: TripGuidanceStatus[] = [
  'on_way',
  'almost_there',
  'at_meeting_point',
  'problem',
  'lost',
  'medical_help',
];

export function isTripGuidanceStatus(value: unknown): value is TripGuidanceStatus {
  return typeof value === 'string' && statuses.includes(value as TripGuidanceStatus);
}

export function parseTripGuidanceOutbox(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const parsed: PendingTripGuidanceStatus[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.guidanceId !== 'number' ||
      !Number.isSafeInteger(candidate.guidanceId) ||
      typeof candidate.participantId !== 'number' ||
      !Number.isSafeInteger(candidate.participantId) ||
      typeof candidate.queuedAt !== 'string' ||
      !isTripGuidanceStatus(candidate.status) ||
      typeof candidate.userId !== 'string' ||
      candidate.userId.length === 0
    ) {
      return undefined;
    }

    parsed.push({
      guidanceId: candidate.guidanceId,
      participantId: candidate.participantId,
      queuedAt: candidate.queuedAt,
      status: candidate.status,
      userId: candidate.userId,
    });
  }

  return parsed;
}

export function buildTripGuidanceParticipantStates(
  participants: TripParticipant[],
  responses: TripGuidanceResponse[],
  pendingStatuses: PendingTripGuidanceStatus[],
): TripGuidanceParticipantState[] {
  const responsesByParticipant = new Map(
    responses.map((response) => [response.participant_id, response]),
  );
  const pendingByParticipant = new Map(
    pendingStatuses.map((pending) => [pending.participantId, pending]),
  );

  return [...participants]
    .sort((left, right) => left.display_name.localeCompare(right.display_name))
    .map((participant) => {
      const response = responsesByParticipant.get(participant.id) ?? null;
      const pending = pendingByParticipant.get(participant.id);
      return {
        ...participant,
        isPending: Boolean(pending),
        response,
        status: pending?.status ?? response?.status ?? null,
      };
    });
}

export function shouldQueueTripGuidanceStatus(error: unknown) {
  return getTripGuidanceSubmitFailureKind(error) === 'offline';
}

export function getTripGuidanceSubmitFailureKind(
  error: unknown,
): TripGuidanceSubmitFailureKind {
  if (!error || typeof error !== 'object') return 'server';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message =
    'message' in error && typeof error.message === 'string' ? error.message : '';

  if (
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    /authentication required|user profile is required|permission denied for function respond_to_trip_guidance/i.test(
      message,
    )
  ) {
    return 'auth';
  }
  if (/active guidance not found/i.test(message)) return 'closed';
  if (/participant is not linked to the current user/i.test(message)) return 'not_linked';
  if (/failed to fetch|fetch failed|load failed|network|offline/i.test(message)) return 'offline';
  return 'server';
}

export function distanceInMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
