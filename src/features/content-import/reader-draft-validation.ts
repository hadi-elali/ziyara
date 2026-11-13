import type { ReaderDraft } from './reader-content-admin';

type ValidationField = 'title' | 'slug' | 'place' | 'sourceUrl' | 'text' | 'previewMissing' | 'emptySection';
type ReaderDraftError = {
  key: `contentImport.validation.${ValidationField}` | 'contentImport.reviewNeeded';
  params?: { number: number };
};

export const slugFromTitle = (title: string) => title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function getReaderDraftError(draft: ReaderDraft, publish: boolean): ReaderDraftError | undefined {
  const title = draft.title.trim();
  // Titles are ordinary text. Punctuation and parentheses are allowed.
  if (title.length < 2 || title.length > 200) return { key: 'contentImport.validation.title' };
  const slug = draft.slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
    return { key: 'contentImport.validation.slug' };
  }
  if (!draft.placeIds.length) return { key: 'contentImport.validation.place' };
  const url = draft.sourceUrl.trim();
  if (url && !/^https?:\/\/\S+$/.test(url)) return { key: 'contentImport.validation.sourceUrl' };
  if (!draft.paragraphs.length) return { key: draft.rawText.trim()
    ? 'contentImport.validation.previewMissing' : 'contentImport.validation.text' };
  const emptySection = draft.paragraphs.findIndex((p) =>
    ![p.arabic, p.transliteration, p.translation_de, p.translation_en].some((text) => text?.trim()));
  if (emptySection >= 0) return { key: 'contentImport.validation.emptySection', params: { number: emptySection + 1 } };
  if (publish && draft.unresolved.length) return { key: 'contentImport.reviewNeeded' };
  return undefined;
}
