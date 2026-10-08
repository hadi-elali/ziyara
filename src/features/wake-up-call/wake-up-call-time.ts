export const wakeUpTimeZone = 'Asia/Baghdad';

export function wakeUpDateTimeFields(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: wakeUpTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

// Resolve entered Iraqi wall time independently of the phone's time zone.
export function parseWakeUpDateTime(date: string, time: string): Date | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) return null;
  const wallTime = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wallTime)) return null;
  const probe = wakeUpDateTimeFields(new Date(wallTime));
  const offset = Date.parse(`${probe.date}T${probe.time}:00Z`) - wallTime;
  const result = new Date(wallTime - offset);
  const resolved = wakeUpDateTimeFields(result);
  return resolved.date === date && resolved.time === time ? result : null;
}

export function formatWakeUpTime(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    timeZone: wakeUpTimeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
