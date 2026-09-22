import { describe, expect, it } from '@jest/globals';

import { regionForGroupLocations } from '@/features/trip-groups/group-location-map-types';

describe('regionForGroupLocations', () => {
  it('centers a single leader with a useful close-up', () => {
    expect(
      regionForGroupLocations({ latitude: 32.616, longitude: 44.032 }, null),
    ).toEqual({
      latitude: 32.616,
      latitudeDelta: 0.012,
      longitude: 44.032,
      longitudeDelta: 0.012,
    });
  });

  it('includes the leader and admin positions with padding', () => {
    const region = regionForGroupLocations(
      { latitude: 32.6, longitude: 44 },
      { latitude: 32.7, longitude: 44.2 },
    );

    expect(region.latitude).toBeCloseTo(32.65);
    expect(region.longitude).toBeCloseTo(44.1);
    expect(region.latitudeDelta).toBeCloseTo(0.17);
    expect(region.longitudeDelta).toBeCloseTo(0.34);
  });
});
