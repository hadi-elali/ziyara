import type { AdminGroupCheckResult } from '@/domain/database';

export type GroupCheckResultGroup = {
  accountCount: number;
  representedPeople: number;
  results: AdminGroupCheckResult[];
};

export type GroupCheckResultSummary = {
  batteryEmpty: GroupCheckResultGroup;
  no: GroupCheckResultGroup;
  open: GroupCheckResultGroup;
  sick: GroupCheckResultGroup;
  totalAccounts: number;
  totalRepresentedPeople: number;
  yes: GroupCheckResultGroup;
};

function createResultGroup(results: AdminGroupCheckResult[]): GroupCheckResultGroup {
  return {
    accountCount: results.length,
    representedPeople: results.reduce((total, result) => total + result.party_size, 0),
    results,
  };
}

export function parseAdminGroupCheckResults(value: unknown): AdminGroupCheckResult[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const isValid = value.every(
    (result) =>
      typeof result === 'object' &&
      result !== null &&
      (!('is_sick' in result) || typeof result.is_sick === 'boolean') &&
      (!('is_battery_empty' in result) || typeof result.is_battery_empty === 'boolean') &&
      'answer' in result &&
      (result.answer === null || typeof result.answer === 'boolean') &&
      'display_name' in result &&
      typeof result.display_name === 'string' &&
      'party_size' in result &&
      typeof result.party_size === 'number' &&
      Number.isInteger(result.party_size) &&
      result.party_size >= 1,
  );

  return isValid ? (value as AdminGroupCheckResult[]) : null;
}

export function summarizeGroupCheckResults(
  results: AdminGroupCheckResult[],
): GroupCheckResultSummary {
  const available = results.filter((result) => !result.is_sick && !result.is_battery_empty);
  const yes = available.filter((result) => result.answer === true);
  const no = available.filter((result) => result.answer === false);
  const open = available.filter((result) => result.answer === null);
  const sick = results.filter((result) => result.is_sick === true);
  const batteryEmpty = results.filter((result) => !result.is_sick && result.is_battery_empty === true);

  return {
    batteryEmpty: createResultGroup(batteryEmpty),
    no: createResultGroup(no),
    open: createResultGroup(open),
    sick: createResultGroup(sick),
    totalAccounts: results.length,
    totalRepresentedPeople: results.reduce((total, result) => total + result.party_size, 0),
    yes: createResultGroup(yes),
  };
}
