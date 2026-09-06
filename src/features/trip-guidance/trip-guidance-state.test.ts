import { describe, expect, it } from '@jest/globals';

import type {
  TripGuidanceResponse,
  TripParticipant,
} from '@/domain/database';
import {
  buildTripGuidanceParticipantStates,
  distanceInMeters,
  getTripGuidanceSubmitFailureKind,
  parseTripGuidanceOutbox,
} from '@/features/trip-guidance/trip-guidance-state';

const participant: TripParticipant = {
  assignment_family_id: null,
  bus_id: 2,
  created_at: '2026-08-27T08:00:00Z',
  display_name: 'Teilnehmer',
  id: 3,
  participant_code: 'BER01',
  profile_id: 4,
  trip_id: 1,
  updated_at: '2026-08-27T08:00:00Z',
};

const response: TripGuidanceResponse = {
  acknowledged_at: null,
  acknowledged_by_display_name: null,
  acknowledged_by_profile_id: null,
  created_at: '2026-08-27T08:01:00Z',
  guidance_id: 5,
  id: 6,
  participant_id: participant.id,
  status: 'on_way',
  trip_id: 1,
  updated_at: '2026-08-27T08:01:00Z',
};

describe('trip guidance state', () => {
  it('zeigt einen lokal vorgemerkten Status vor dem älteren Serverstatus', () => {
    expect(
      buildTripGuidanceParticipantStates([participant], [response], [
        {
          guidanceId: 5,
          participantId: participant.id,
          queuedAt: '2026-08-27T08:02:00Z',
          status: 'almost_there',
          userId: 'user-1',
        },
      ])[0],
    ).toMatchObject({ isPending: true, status: 'almost_there' });
  });

  it('verwirft beschädigte Offline-Warteschlangen', () => {
    expect(parseTripGuidanceOutbox([{ guidanceId: 5, status: 'unknown' }])).toBeUndefined();
    expect(parseTripGuidanceOutbox([])).toEqual([]);
  });

  it('klassifiziert nur Verbindungsfehler als offline', () => {
    expect(getTripGuidanceSubmitFailureKind({ message: 'TypeError: Failed to fetch' })).toBe(
      'offline',
    );
    expect(getTripGuidanceSubmitFailureKind({ message: 'Active guidance not found.' })).toBe(
      'closed',
    );
  });

  it('berechnet die Luftlinie ohne dauerhaftes Tracking', () => {
    const distance = distanceInMeters(
      { latitude: 32.616, longitude: 44.032 },
      { latitude: 32.617, longitude: 44.032 },
    );
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });
});
