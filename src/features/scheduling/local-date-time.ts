export function localDateTimeFields(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
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

// Use the sender's current device time zone, including the offset on that date.
export function parseLocalDateTime(date: string, time: string): Date | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) return null;
  const result = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(result.getTime())) return null;
  // Reject calendar rollovers and local times skipped by daylight saving time.
  const resolved = localDateTimeFields(result);
  return resolved.date === date && resolved.time === time ? result : null;
}

export function formatLocalDateTime(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
