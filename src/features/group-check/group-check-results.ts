import type { AdminGroupCheckResult } from '@/domain/database';

export type GroupCheckResultGroup = {
  accountCount: number;
  representedPeople: number;
  results: AdminGroupCheckResult[];
};

export type GroupCheckResultSummary = {
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
  const yes = results.filter((result) => !result.is_sick && result.answer === true);
  const no = results.filter((result) => !result.is_sick && result.answer === false);
  const open = results.filter((result) => !result.is_sick && result.answer === null);
  const sick = results.filter((result) => result.is_sick === true);

  return {
    no: createResultGroup(no),
    open: createResultGroup(open),
    sick: createResultGroup(sick),
    totalAccounts: results.length,
    totalRepresentedPeople: results.reduce((total, result) => total + result.party_size, 0),
    yes: createResultGroup(yes),
  };
}
