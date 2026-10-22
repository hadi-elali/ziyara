import type { DailyProgram } from '@/domain/database';

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalISODate(value: string) {
  const match = isoDatePattern.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function addDaysToISODate(value: string, days: number) {
  const date = parseLocalISODate(value);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return localISODate(date);
}

export function dailyProgramDateRange(startDate: string, count: number) {
  if (!Number.isSafeInteger(count) || count < 1) return [];

  const dates: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = addDaysToISODate(startDate, offset);
    if (!date) return [];
    dates.push(date);
  }
  return dates;
}

export function visibleDailyPrograms(
  programs: DailyProgram[],
  today = localISODate(),
) {
  return programs
    .filter((program) => program.program_date >= today)
    .sort((left, right) => left.program_date.localeCompare(right.program_date));
}

export function nextDailyProgramDate(programs: DailyProgram[], today = localISODate()) {
  const lastProgram = visibleDailyPrograms(programs, today).at(-1);
  return lastProgram ? (addDaysToISODate(lastProgram.program_date, 1) ?? today) : today;
}

export function splitProgramDetails(details: string) {
  return details
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}
