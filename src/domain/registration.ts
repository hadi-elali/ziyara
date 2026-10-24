/** Additional travellers represented by the registering account, excluding its owner. */
export type RegistrationFamilyMember = {
  /** Age in completed years at registration; absent in older snapshots. */
  age?: number;
  /** Calendar date (YYYY-MM-DD); absent in snapshots from older clients. */
  birth_date?: string;
  name: string;
  surname: string;
};

export type RegistrationFamilyMemberInput = RegistrationFamilyMember & {
  age: number;
  birth_date: string;
};

export const maximumRegistrationFamilyMembers = 49;
