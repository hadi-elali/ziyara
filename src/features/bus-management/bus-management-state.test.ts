import { describe, expect, it } from '@jest/globals';

import type { BusBoardingResponse, TripBus, TripParticipant } from '@/domain/database';
import {
  buildBusClosureStates,
  buildBusParticipantStates,
  getGeneralAlarmReminderDueAt,
  getGeneralAlarmUrgency,
  getNextGeneralAlarmStatus,
  getBusStatusSubmitFailureKind,
  isGeneralAlarmReminderDue,
  shouldRetryBusStatusAfterSessionRefresh,
  summarizeBusBoarding,
  type BusStatusSubmitFailureKind,
} from '@/features/bus-management/bus-management-state';

const buses: TripBus[] = [
  { created_at: '2026-08-27T00:00:00Z', id: 20, leader_participant_id: null, name: 'Bus 2', sort_order: 2, trip_id: 1 },
  { created_at: '2026-08-27T00:00:00Z', id: 40, leader_participant_id: null, name: 'Bus 1', sort_order: 1, trip_id: 1 },
];

function participant(
  id: number,
  participantCode: string,
  busId: number | null,
): TripParticipant {
  return {
    assignment_family_id: null,
    bus_id: busId,
    created_at: '2026-08-27T00:00:00Z',
    display_name: `Person ${id}`,
    id,
    participant_code: participantCode,
    profile_id: id,
    trip_id: 1,
    updated_at: '2026-08-27T00:00:00Z',
  };
}

function response(participantId: number, status: BusBoardingResponse['status']): BusBoardingResponse {
  return {
    boarding_id: 10,
    created_at: '2026-08-27T00:00:00Z',
    id: participantId,
    participant_id: participantId,
    status,
    trip_id: 1,
    updated_at: '2026-08-27T00:00:00Z',
    updated_by_profile_id: 1,
  };
}

describe('bus management state', () => {
  it('ordnet Teilnehmer nach Bus-Reihenfolge und Name', () => {
    const states = buildBusParticipantStates(
      [participant(1, 'DUS02', 20), participant(2, 'FRA01', null), participant(3, 'DUS01', 40)],
      buses,
      [response(3, 'boarded')],
    );

    expect(states.map(({ participant_code }) => participant_code)).toEqual([
      'DUS01',
      'DUS02',
      'FRA01',
    ]);
    expect(states[0]).toMatchObject({ bus_name: 'Bus 1', status: 'boarded' });
    expect(states[1]).toMatchObject({ bus_name: 'Bus 2', status: null });
    expect(states[2]).toMatchObject({ bus_name: null, status: null });
  });

  it('unterscheidet gelesen, unterwegs, im Bus, Problem und noch offen', () => {
    const states = buildBusParticipantStates(
      [
        participant(1, 'BER01', 40),
        participant(2, 'BER02', 40),
        participant(3, 'BER03', 40),
        participant(4, 'BER04', 40),
        participant(5, 'BER05', 40),
      ],
      buses,
      [
        response(1, 'boarded'),
        response(2, 'on_way'),
        response(3, 'problem'),
        response(5, 'read'),
      ],
    );

    expect(summarizeBusBoarding(states)).toEqual({
      boarded: 1,
      confirmed: 4,
      notConfirmed: 1,
      onWay: 1,
      problem: 1,
      read: 1,
      total: 5,
    });
  });

  it('berechnet Statusfolge, Fünf-Minuten-Frist und Dringlichkeit deterministisch', () => {
    const boarding = {
      departure_at: '2026-08-27T09:15:00Z',
      opened_at: '2026-08-27T09:00:00Z',
      reminder_interval_minutes: 5,
      urgent_before_minutes: 5,
    };
    const waiting = { response_updated_at: null, status: null };

    expect(getNextGeneralAlarmStatus(null)).toBe('read');
    expect(getNextGeneralAlarmStatus('read')).toBe('on_way');
    expect(getNextGeneralAlarmStatus('on_way')).toBe('boarded');
    expect(getNextGeneralAlarmStatus('boarded')).toBeNull();
    expect(getNextGeneralAlarmStatus('problem')).toBeNull();
    expect(getGeneralAlarmReminderDueAt(boarding, waiting)?.toISOString()).toBe(
      '2026-08-27T09:05:00.000Z',
    );
    expect(isGeneralAlarmReminderDue(boarding, waiting, new Date('2026-08-27T09:04:59Z'))).toBe(
      false,
    );
    expect(isGeneralAlarmReminderDue(boarding, waiting, new Date('2026-08-27T09:05:00Z'))).toBe(
      true,
    );
    expect(getGeneralAlarmUrgency(boarding, new Date('2026-08-27T09:09:59Z'))).toBe('normal');
    expect(getGeneralAlarmUrgency(boarding, new Date('2026-08-27T09:10:00Z'))).toBe('urgent');
    expect(getGeneralAlarmUrgency(boarding, new Date('2026-08-27T09:15:00Z'))).toBe('overdue');
  });

  it('zeigt pro Bus, ob noch Personen fehlen', () => {
    const states = buildBusParticipantStates(
      [
        participant(1, 'BER01', 40),
        participant(2, 'BER02', 40),
        participant(3, 'DUS01', 20),
      ],
      buses,
      [response(1, 'boarded'), response(2, 'read'), response(3, 'boarded')],
    );

    expect(buildBusClosureStates(states)).toEqual([
      {
        boarded: 1,
        busId: 40,
        busName: 'Bus 1',
        canClose: false,
        outstandingParticipantNames: ['Person 2'],
        total: 2,
      },
      {
        boarded: 1,
        busId: 20,
        busName: 'Bus 2',
        canClose: true,
        outstandingParticipantNames: [],
        total: 1,
      },
    ]);
  });

  it('erneuert die Sitzung nur bei Authentifizierungsfehlern des Busstatus-RPCs', () => {
    expect(
      shouldRetryBusStatusAfterSessionRefresh({
        code: '42501',
        message: 'permission denied for function respond_to_bus_boarding',
      }),
    ).toBe(true);
    expect(
      shouldRetryBusStatusAfterSessionRefresh({
        code: '42501',
        message: 'permission denied for function admin_set_bus_boarding_status',
      }),
    ).toBe(true);
    expect(
      shouldRetryBusStatusAfterSessionRefresh({ code: 'XX000', message: 'database unavailable' }),
    ).toBe(false);
  });

  const submitFailureCases: [Record<string, string>, BusStatusSubmitFailureKind][] = [
    [{ code: 'PGRST301', message: 'JWT expired' }, 'auth'],
    [{ code: 'P0001', message: 'active boarding not found' }, 'closed'],
    [
      { code: 'P0001', message: 'participant is not linked to the current user' },
      'not_linked',
    ],
    [{ message: 'Failed to fetch' }, 'offline'],
    [{ code: 'XX000', message: 'database unavailable' }, 'server'],
  ];

  it.each(submitFailureCases)('ordnet Speicherfehler %p als %s ein', (error, expectedKind) => {
    expect(getBusStatusSubmitFailureKind(error)).toBe(expectedKind);
  });
});
