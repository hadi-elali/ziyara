export function getAge(value: string): number | null {
  const normalized = value.trim();

  if (!/^[0-9]{1,3}$/.test(normalized)) {
    return null;
  }

  const age = Number(normalized);
  return age <= 120 ? age : null;
}
