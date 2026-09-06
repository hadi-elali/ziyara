import type {
  BusBoarding,
  BusBoardingEscalation,
  BusBoardingResponse,
  BusBoardingStatus,
  TripBus,
  TripParticipant,
} from '@/domain/database';

export type BusParticipantState = TripParticipant & {
  bus_name: string | null;
  escalation: BusBoardingEscalation | null;
  response_updated_at: string | null;
  status: BusBoardingStatus | null;
};

export type BusBoardingSummary = {
  boarded: number;
  confirmed: number;
  notConfirmed: number;
  onWay: number;
  problem: number;
  read: number;
  total: number;
};

export type BusClosureState = {
  boarded: number;
  busId: number | null;
  busName: string | null;
  canClose: boolean;
  outstandingParticipantNames: string[];
  total: number;
};

export type GeneralAlarmUrgency = 'normal' | 'overdue' | 'urgent';

export type BusStatusSubmitFailureKind =
  | 'auth'
  | 'closed'
  | 'not_linked'
  | 'offline'
  | 'server';

export function shouldRetryBusStatusAfterSessionRefresh(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message =
    'message' in error && typeof error.message === 'string' ? error.message : '';

  return (
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    /permission denied for function (respond_to_bus_boarding|admin_set_bus_boarding_status)/i.test(
      message,
    )
  );
}

export function getBusStatusSubmitFailureKind(error: unknown): BusStatusSubmitFailureKind {
  if (!error || typeof error !== 'object') return 'server';
  const message =
    'message' in error && typeof error.message === 'string' ? error.message : '';

  if (
    shouldRetryBusStatusAfterSessionRefresh(error) ||
    /admin access required|authentication required|user profile is required/i.test(message)
  ) {
    return 'auth';
  }

  if (/active boarding not found/i.test(message)) return 'closed';
  if (/participant is not linked to the current user/i.test(message)) return 'not_linked';
  if (/failed to fetch|fetch failed|load failed|network/i.test(message)) return 'offline';
  return 'server';
}

export function buildBusParticipantStates(
  participants: TripParticipant[],
  buses: TripBus[],
  responses: BusBoardingResponse[],
  escalations: BusBoardingEscalation[] = [],
): BusParticipantState[] {
  const busNames = new Map(buses.map((bus) => [bus.id, bus.name]));
  const busSortOrders = new Map(buses.map((bus) => [bus.id, bus.sort_order]));
  const responsesByParticipant = new Map(
    responses.map((response) => [response.participant_id, response]),
  );
  const escalationsByParticipant = new Map(
    escalations.map((escalation) => [escalation.participant_id, escalation]),
  );

  return [...participants]
    .sort((left, right) => {
      const leftBus =
        left.bus_id === null
          ? Number.MAX_SAFE_INTEGER
          : (busSortOrders.get(left.bus_id) ?? Number.MAX_SAFE_INTEGER - 1);
      const rightBus =
        right.bus_id === null
          ? Number.MAX_SAFE_INTEGER
          : (busSortOrders.get(right.bus_id) ?? Number.MAX_SAFE_INTEGER - 1);
      return leftBus - rightBus || left.display_name.localeCompare(right.display_name);
    })
    .map((participant) => {
      const response = responsesByParticipant.get(participant.id);
      return {
        ...participant,
        bus_name: participant.bus_id === null ? null : (busNames.get(participant.bus_id) ?? null),
        escalation: escalationsByParticipant.get(participant.id) ?? null,
        response_updated_at: response?.updated_at ?? null,
        status: response?.status ?? null,
      };
    });
}

export function summarizeBusBoarding(
  participants: Pick<BusParticipantState, 'status'>[],
): BusBoardingSummary {
  return participants.reduce<BusBoardingSummary>(
    (summary, participant) => {
      summary.total += 1;

      if (participant.status === 'boarded') {
        summary.boarded += 1;
        summary.confirmed += 1;
      } else if (participant.status === 'read') {
        summary.read += 1;
        summary.confirmed += 1;
      } else if (participant.status === 'on_way') {
        summary.onWay += 1;
        summary.confirmed += 1;
      } else if (participant.status === 'problem') {
        summary.problem += 1;
        summary.confirmed += 1;
      } else {
        summary.notConfirmed += 1;
      }

      return summary;
    },
    { boarded: 0, confirmed: 0, notConfirmed: 0, onWay: 0, problem: 0, read: 0, total: 0 },
  );
}

export function getNextGeneralAlarmStatus(
  status: BusBoardingStatus | null,
): BusBoardingStatus | null {
  if (status === null) return 'read';
  if (status === 'read') return 'on_way';
  if (status === 'on_way') return 'boarded';
  return null;
}

export function getGeneralAlarmReminderDueAt(
  boarding: Pick<BusBoarding, 'opened_at' | 'reminder_interval_minutes'>,
  participant: Pick<BusParticipantState, 'response_updated_at' | 'status'>,
) {
  if (getNextGeneralAlarmStatus(participant.status) === null) return null;
  const stageStartedAt = participant.response_updated_at ?? boarding.opened_at;
  return new Date(
    new Date(stageStartedAt).getTime() + boarding.reminder_interval_minutes * 60_000,
  );
}

export function isGeneralAlarmReminderDue(
  boarding: Pick<BusBoarding, 'opened_at' | 'reminder_interval_minutes'>,
  participant: Pick<BusParticipantState, 'response_updated_at' | 'status'>,
  now = new Date(),
) {
  const dueAt = getGeneralAlarmReminderDueAt(boarding, participant);
  return dueAt ? dueAt.getTime() <= now.getTime() : false;
}

export function getGeneralAlarmUrgency(
  boarding: Pick<BusBoarding, 'departure_at' | 'urgent_before_minutes'>,
  now = new Date(),
): GeneralAlarmUrgency {
  const remainingMs = new Date(boarding.departure_at).getTime() - now.getTime();
  if (remainingMs <= 0) return 'overdue';
  if (remainingMs <= boarding.urgent_before_minutes * 60_000) return 'urgent';
  return 'normal';
}

export function buildBusClosureStates(
  participants: Pick<BusParticipantState, 'bus_id' | 'bus_name' | 'display_name' | 'status'>[],
): BusClosureState[] {
  const groups = new Map<number | null, BusClosureState>();

  for (const participant of participants) {
    const current = groups.get(participant.bus_id) ?? {
      boarded: 0,
      busId: participant.bus_id,
      busName: participant.bus_name,
      canClose: true,
      outstandingParticipantNames: [],
      total: 0,
    };
    current.total += 1;

    if (participant.status === 'boarded') {
      current.boarded += 1;
    } else {
      current.canClose = false;
      current.outstandingParticipantNames.push(participant.display_name);
    }

    groups.set(participant.bus_id, current);
  }

  return [...groups.values()];
}
