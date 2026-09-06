import type { BusBoarding, BusBoardingStatus } from '@/domain/database';
import type { BusParticipantState } from '@/features/bus-management/bus-management-state';
import { getNextGeneralAlarmStatus } from '@/features/bus-management/bus-management-state';

export type GeneralAlarmReminderPlan = {
  boardingId: number;
  fireDates: Date[];
  nextStatus: BusBoardingStatus;
  participantName: string;
  participantId: number;
};

const maximumScheduledRemindersPerParticipant = 12;
const postDepartureReminderWindowMs = 30 * 60_000;

export function buildGeneralAlarmReminderPlans(
  boarding: Pick<
    BusBoarding,
    'departure_at' | 'id' | 'opened_at' | 'reminder_interval_minutes'
  >,
  participants: Pick<
    BusParticipantState,
    'display_name' | 'id' | 'response_updated_at' | 'status'
  >[],
  now = new Date(),
): GeneralAlarmReminderPlan[] {
  const intervalMs = boarding.reminder_interval_minutes * 60_000;
  const horizon = Math.max(
    new Date(boarding.departure_at).getTime() + postDepartureReminderWindowMs,
    now.getTime() + intervalMs,
  );

  return participants.flatMap((participant) => {
    const nextStatus = getNextGeneralAlarmStatus(participant.status);
    if (!nextStatus) return [];

    const stageStartedAt = new Date(
      participant.response_updated_at ?? boarding.opened_at,
    ).getTime();
    let nextReminderAt = stageStartedAt + intervalMs;

    while (nextReminderAt <= now.getTime()) {
      nextReminderAt += intervalMs;
    }

    const fireDates: Date[] = [];
    while (
      nextReminderAt <= horizon &&
      fireDates.length < maximumScheduledRemindersPerParticipant
    ) {
      fireDates.push(new Date(nextReminderAt));
      nextReminderAt += intervalMs;
    }

    return [
      {
        boardingId: boarding.id,
        fireDates,
        nextStatus,
        participantName: participant.display_name,
        participantId: participant.id,
      },
    ];
  });
}
