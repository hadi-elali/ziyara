export const maximumGeneralAlarmDepartureMinutes = 1_440;

const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
const easternArabicIndicDigits = '۰۱۲۳۴۵۶۷۸۹';

export function parseGeneralAlarmDepartureMinutes(value: string) {
  const normalizedValue = [...value.trim()]
    .map((character) => {
      const arabicIndicIndex = arabicIndicDigits.indexOf(character);
      if (arabicIndicIndex >= 0) return String(arabicIndicIndex);

      const easternArabicIndicIndex = easternArabicIndicDigits.indexOf(character);
      return easternArabicIndicIndex >= 0 ? String(easternArabicIndicIndex) : character;
    })
    .join('');

  if (!/^\d{1,4}$/.test(normalizedValue)) return null;

  const minutes = Number(normalizedValue);
  return minutes >= 1 && minutes <= maximumGeneralAlarmDepartureMinutes
    ? minutes
    : null;
}
