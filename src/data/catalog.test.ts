import { describe, expect, it } from '@jest/globals';

import { searchCatalog } from '@/data/catalog';
import { allPlaces } from '@/data/places';
import { recommendedActs } from '@/data/recommendedActs';
import {
  getReligiousContentBySlug,
  religiousContent,
} from '@/data/religiousContent';
import { sourceReferences } from '@/data/sourceReferences';

function expectUnique(values: string[]) {
  expect(new Set(values).size).toBe(values.length);
}

describe('catalog integrity', () => {
  it('uses unique stable identifiers and slugs', () => {
    expectUnique(allPlaces.map((place) => place.id));
    expectUnique(allPlaces.map((place) => place.slug));
    expectUnique(recommendedActs.map((act) => act.id));
    expectUnique(religiousContent.map((content) => content.id));
    expectUnique(religiousContent.map((content) => content.slug));
    expectUnique(sourceReferences.map((source) => source.id));
  });

  it('keeps every catalog relationship resolvable', () => {
    const actIds = new Set(recommendedActs.map((act) => act.id));
    const contentIds = new Set(religiousContent.map((content) => content.id));
    const placeIds = new Set(allPlaces.map((place) => place.id));
    const sourceIds = new Set(sourceReferences.map((source) => source.id));

    allPlaces.forEach((place) => {
      expect(place.latitude).toBeGreaterThanOrEqual(-90);
      expect(place.latitude).toBeLessThanOrEqual(90);
      expect(place.longitude).toBeGreaterThanOrEqual(-180);
      expect(place.longitude).toBeLessThanOrEqual(180);
      place.recommendedActs.forEach((id) => expect(actIds).toContain(id));
      place.relatedContentIds.forEach((id) => expect(contentIds).toContain(id));
      place.sourceReferences.forEach((id) => expect(sourceIds).toContain(id));
    });

    recommendedActs.forEach((act) => {
      expect(placeIds).toContain(act.recommendedAtPlaceId);
      if (act.contentId) {
        expect(contentIds).toContain(act.contentId);
      }
      act.sourceReferences.forEach((id) => expect(sourceIds).toContain(id));
    });

    religiousContent.forEach((content) => {
      expect(content.paragraphs.length).toBeGreaterThan(0);
      content.paragraphs.forEach((paragraph) => {
        expect(typeof paragraph.arabic).toBe('string');
        expect(typeof paragraph.transliteration).toBe('string');
        expect(typeof paragraph.translation_de).toBe('string');
      });
      content.sourceReferences.forEach((id) => expect(sourceIds).toContain(id));
    });
  });

  it('keeps legacy reader links working after corrected placeholder names', () => {
    expect(getReligiousContentBySlug('general-ziyarah-etiquette-placeholder')?.slug).toBe(
      'ziyarat-arbaeen-placeholder',
    );
    expect(getReligiousContentBySlug('two-rakat-prayer-placeholder')?.slug).toBe(
      'dua-safwan-placeholder',
    );
  });
});

describe('catalog search', () => {
  it('normalizes Latin diacritics', () => {
    expect(searchCatalog('ziyarah', 'places', 'de').length).toBeGreaterThan(0);
  });

  it('normalizes Arabic diacritics and alef variants', () => {
    const plain = searchCatalog('الحسين', 'all', 'ar');
    const withDiacritics = searchCatalog('اَلْحُسَيْن', 'all', 'ar');

    expect(plain.length).toBeGreaterThan(0);
    expect(withDiacritics.map((result) => result.id)).toEqual(
      expect.arrayContaining(plain.map((result) => result.id)),
    );
  });

  it('does not route acts without reader content to an unrelated entry', () => {
    const prayerResults = searchCatalog('Gebet mit zwei', 'acts', 'de');

    expect(prayerResults.length).toBeGreaterThan(0);
    expect(prayerResults.every((result) => result.kind === 'act' && !result.slug)).toBe(true);
  });
});
