import {
  maximumRegistrationFamilyMembers,
  type RegistrationFamilyMemberInput,
} from '@/domain/registration';
import { getAge } from './age';
import { getAgeFromBirthDate, getBirthDate } from './birth-date';

export type RegistrationFamilyMemberDraft = {
  name: string;
  surname: string;
  birthDate: string;
  age: string;
};

export function normalizeRegistrationFamilyMembers(
  members: readonly RegistrationFamilyMemberDraft[],
): RegistrationFamilyMemberInput[] | null {
  if (members.length < 1 || members.length > maximumRegistrationFamilyMembers) {
    return null;
  }

  const normalized: RegistrationFamilyMemberInput[] = [];
  for (const member of members) {
    const name = member.name.trim();
    const surname = member.surname.trim();
    const birthDate = getBirthDate(member.birthDate);
    const age = getAge(member.age);
    if (!birthDate || age === null || age !== getAgeFromBirthDate(birthDate) ||
      Array.from(name).length < 1 || Array.from(name).length > 80 ||
      Array.from(surname).length < 1 || Array.from(surname).length > 80) {
      return null;
    }
    normalized.push({ name, surname, birth_date: birthDate, age });
  }
  return normalized;
}
