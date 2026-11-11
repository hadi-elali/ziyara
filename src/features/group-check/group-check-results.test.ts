import { describe, expect, it } from '@jest/globals';

import {
  parseAdminGroupCheckResults,
  summarizeGroupCheckResults,
} from '@/features/group-check/group-check-results';

describe('group check result summary', () => {
  it('zählt kranke Konten ausschließlich in ihrer eigenen Kategorie und erhält die Antworten', () => {
    const results = [
      { answer: null, display_name: 'Krank ohne Antwort', party_size: 3, is_sick: true },
      { answer: true, display_name: 'Krank nach Ja', party_size: 2, is_sick: true },
      { answer: false, display_name: 'Krank nach Nein', party_size: 1, is_sick: true },
      { answer: null, display_name: 'Offen', party_size: 4, is_sick: false },
    ];
    const summary = summarizeGroupCheckResults(results);
    expect(summary).toMatchObject({
      sick: { accountCount: 3, representedPeople: 6 },
      open: { accountCount: 1, representedPeople: 4 },
      yes: { accountCount: 0 }, no: { accountCount: 0 },
      totalAccounts: 4, totalRepresentedPeople: 10,
    });
    const recovered = summarizeGroupCheckResults(results.map((result) => ({ ...result, is_sick: false })));
    expect(recovered).toMatchObject({
      sick: { accountCount: 0 }, open: { accountCount: 2 },
      yes: { accountCount: 1 }, no: { accountCount: 1 },
    });
    expect(parseAdminGroupCheckResults(results)).toEqual(results);
    expect(parseAdminGroupCheckResults([{ ...results[0], is_sick: 'true' }])).toBeNull();
    expect(parseAdminGroupCheckResults([{ ...results[0], is_sick: null }])).toBeNull();
  });

  it('trennt Ja, Nein und offene Accounts von den repräsentierten Personen', () => {
    const summary = summarizeGroupCheckResults([
      { answer: true, display_name: 'Account A', party_size: 2 },
      { answer: false, display_name: 'Account B', party_size: 4 },
      { answer: null, display_name: 'Account C', party_size: 3 },
      { answer: null, display_name: 'Account D', party_size: 1 },
    ]);

    expect(summary).toMatchObject({
      no: { accountCount: 1, representedPeople: 4 },
      open: { accountCount: 2, representedPeople: 4 },
      totalAccounts: 4,
      totalRepresentedPeople: 10,
      yes: { accountCount: 1, representedPeople: 2 },
    });
    expect(summary.open.results.map((result) => result.display_name)).toEqual([
      'Account C',
      'Account D',
    ]);
  });

  it('weist das alte RPC-Schema ohne party_size zurück', () => {
    expect(
      parseAdminGroupCheckResults([{ answer: true, display_name: 'Altes Ergebnis' }]),
    ).toBeNull();
    expect(
      parseAdminGroupCheckResults([
        { answer: null, display_name: 'Aktuelles Ergebnis', party_size: 3 },
      ]),
    ).toEqual([{ answer: null, display_name: 'Aktuelles Ergebnis', party_size: 3 }]);
  });
});
