/** Insert date separators while typing, including Arabic/Persian digit input. */
export function formatBirthDateInput(value: string) {
  const digits = value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/\D/g, '')
    .slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

/** Parse a real calendar date without time-zone conversion or date rollover. */
export function getBirthDate(value: string, today = new Date()): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (year < 1) return null;

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  const localToday = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  if (year * 10000 + month * 100 + day > localToday) return null;

  return `${yearText}-${monthText}-${dayText}`;
}

/** Completed years on the registration date, bounded like profiles.age. */
export function getAgeFromBirthDate(birthDate: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [, year, month, day] = match;
  if (!getBirthDate(`${day}.${month}.${year}`, today)) return null;

  let age = today.getFullYear() - Number(year);
  if ((today.getMonth() + 1) * 100 + today.getDate() < Number(month) * 100 + Number(day)) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}
