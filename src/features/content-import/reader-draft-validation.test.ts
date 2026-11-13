import { describe, expect, it } from '@jest/globals';

import type { ReaderDraft } from './reader-content-admin';
import { getReaderDraftError, slugFromTitle } from './reader-draft-validation';

const original = 'نص تجريبي\nlatin sample\nEnglish sample';
const valid: ReaderDraft = {
  id: 'reader-test', title: 'Example title', slug: 'example-title', contentType: 'ziyarah',
  notes: '', sourceTitle: '', sourceUrl: '', placeIds: ['place-test'],
  rawText: original, parsedRaw: original, rawGerman: '', unresolved: [], updatedAt: null, wasPublished: false,
  paragraphs: [{ arabic: 'نص تجريبي', transliteration: 'latin sample', translation_de: '', translation_en: 'English sample' }],
};

describe('reader draft input validation', () => {
  it('accepts the reported title with its period and parentheses unchanged', () => {
    const title = 'Salawat für Imam Hadi al Naqi (as.)';
    const draft = { ...valid, title, slug: slugFromTitle(title) };
    expect(draft.slug).toBe('salawat-fur-imam-hadi-al-naqi-as');
    expect(getReaderDraftError(draft, true)).toBeUndefined();
    expect(draft.title).toBe(title);
  });

  it.each(['Ein Titel (a.)', 'Ein Titel.', 'Titel: ein Beispiel!', 'عنوان تجريبي'])('accepts ordinary title text: %s', (title) => {
    expect(getReaderDraftError({ ...valid, title }, false)).toBeUndefined();
  });

  it.each([
    [{ title: ' ' }, 'title'],
    [{ title: 'x'.repeat(201) }, 'title'],
    [{ slug: 'invalid.link' }, 'slug'],
    [{ slug: 'name--with-gap' }, 'slug'],
    [{ slug: 'x'.repeat(121) }, 'slug'],
    [{ placeIds: [] }, 'place'],
    [{ sourceUrl: 'example.invalid/source' }, 'sourceUrl'],
    [{ sourceUrl: 'https://example.invalid/a b' }, 'sourceUrl'],
    [{ paragraphs: [] }, 'previewMissing'],
    [{ paragraphs: [], rawText: '' }, 'text'],
  ] as [Partial<ReaderDraft>, string][])('identifies the specific invalid input (%s)', (change, field) => {
    expect(getReaderDraftError({ ...valid, ...change }, false)?.key).toBe(`contentImport.validation.${field}`);
  });

  it('identifies the empty section by its position', () => {
    const draft = { ...valid, paragraphs: [...valid.paragraphs, { arabic: '', transliteration: '', translation_de: '' }] };
    expect(getReaderDraftError(draft, false)).toEqual({ key: 'contentImport.validation.emptySection', params: { number: 2 } });
  });

  it('accepts surrounding link-name whitespace that the save request already trims', () => {
    expect(getReaderDraftError({ ...valid, slug: ' example-title ' }, false)).toBeUndefined();
  });

  it.each([false, true])('accepts edited sections independently of later original input changes (publish: %s)', (publish) => {
    expect(getReaderDraftError({ ...valid, rawText: `${original}\nchanged`,
      paragraphs: [{ ...valid.paragraphs[0], kind: 'introduction', translation_de: 'Edited German sample' }] }, publish)).toBeUndefined();
  });

  it('keeps incomplete assignments saveable as a draft but blocks publication', () => {
    const draft = { ...valid, unresolved: [0] };
    expect(getReaderDraftError(draft, false)).toBeUndefined();
    expect(getReaderDraftError(draft, true)?.key).toBe('contentImport.reviewNeeded');
  });
});
