import type {
  ReligiousContentRecord,
  ReligiousTextParagraphRecord,
} from '@/domain/database';
import type { ReligiousContent, ReligiousContentType } from '@/domain/types';

const religiousContentTypes: ReligiousContentType[] = [
  'dua',
  'ziyarah',
  'salawat',
  'surah',
  'instruction',
];

export function mapReligiousContentRows(
  content: ReligiousContentRecord,
  paragraphs: ReligiousTextParagraphRecord[],
): ReligiousContent | undefined {
  if (
    !content.is_published ||
    content.content_policy !== 'approved_for_offline' ||
    !religiousContentTypes.includes(content.content_type) ||
    content.verification_status !== 'verified' ||
    paragraphs.length === 0
  ) {
    return undefined;
  }

  return {
    id: content.id,
    language: content.language,
    notes: content.notes,
    paragraphs: [...paragraphs]
      .sort((left, right) => left.position - right.position)
      .map((paragraph) => ({
        arabic: paragraph.arabic,
        transliteration: paragraph.transliteration,
        translation_de: paragraph.translation_de,
      })),
    reviewedAt: content.reviewed_at ?? undefined,
    reviewedBy: content.reviewed_by ?? undefined,
    slug: content.slug,
    sourceReferences: content.source_references,
    title: content.title,
    type: content.content_type,
    verificationStatus: content.verification_status,
    version: content.version,
  };
}
