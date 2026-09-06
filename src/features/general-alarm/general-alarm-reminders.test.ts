import { describe, expect, it } from '@jest/globals';

import { buildGeneralAlarmReminderPlans } from '@/features/general-alarm/general-alarm-reminders';

const boarding = {
  departure_at: '2026-08-27T09:15:00Z',
  id: 10,
  opened_at: '2026-08-27T09:00:00Z',
  reminder_interval_minutes: 5,
};

describe('general alarm reminder planning', () => {
  it('plant die nächste fehlende Stufe im Fünf-Minuten-Raster', () => {
    const plans = buildGeneralAlarmReminderPlans(
      boarding,
      [
        {
          id: 1,
          display_name: 'Person 1',
          response_updated_at: null,
          status: null,
        },
        {
          id: 2,
          display_name: 'Person 2',
          response_updated_at: '2026-08-27T09:02:00Z',
          status: 'read',
        },
      ],
      new Date('2026-08-27T09:01:00Z'),
    );

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ nextStatus: 'read', participantName: 'Person 1' });
    expect(plans[0].fireDates[0].toISOString()).toBe('2026-08-27T09:05:00.000Z');
    expect(plans[1]).toMatchObject({ nextStatus: 'on_way', participantName: 'Person 2' });
    expect(plans[1].fireDates[0].toISOString()).toBe('2026-08-27T09:07:00.000Z');
  });

  it('überspringt verstrichene Slots und beendet fertige oder problematische Stufen', () => {
    const plans = buildGeneralAlarmReminderPlans(
      boarding,
      [
        {
          id: 1,
          display_name: 'Person 1',
          response_updated_at: null,
          status: null,
        },
        {
          id: 2,
          display_name: 'Person 2',
          response_updated_at: '2026-08-27T09:03:00Z',
          status: 'boarded',
        },
        {
          id: 3,
          display_name: 'Person 3',
          response_updated_at: '2026-08-27T09:03:00Z',
          status: 'problem',
        },
      ],
      new Date('2026-08-27T09:08:00Z'),
    );

    expect(plans).toHaveLength(1);
    expect(plans[0].fireDates[0].toISOString()).toBe('2026-08-27T09:10:00.000Z');
    expect(plans[0].fireDates.length).toBeLessThanOrEqual(12);
  });
});
