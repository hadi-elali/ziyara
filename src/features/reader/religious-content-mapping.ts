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

export function mapReligiousContentMetadata(
  content: ReligiousContentRecord,
): ReligiousContent | undefined {
  const isReviewed = content.verification_status === 'verified' && content.content_policy === 'approved_for_offline';
  const isUnreviewedImport = content.is_imported === true && content.verification_status === 'needs_review'
    && content.content_policy === 'pending_rights_review';
  if (
    !content.is_published ||
    !religiousContentTypes.includes(content.content_type) ||
    (!isReviewed && !isUnreviewedImport)
  ) {
    return undefined;
  }

  return {
    isRemote: true,
    isImported: content.is_imported === true,
    contentPolicy: content.content_policy,
    updatedAt: content.updated_at,
    placeIds: content.place_ids ?? [],
    sources: content.source_title || content.source_url ? [{
      id: `import-${content.id}`, title: content.source_title || content.source_url || '', url: content.source_url || undefined,
      notes: '', contentPolicy: content.content_policy,
    }] : content.is_imported ? [] : undefined,
    id: content.id,
    language: content.language,
    notes: content.notes,
    paragraphs: [],
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

export function mapReligiousContentRows(content: ReligiousContentRecord, paragraphs: ReligiousTextParagraphRecord[]): ReligiousContent | undefined {
  const metadata = mapReligiousContentMetadata(content);
  if (!metadata || !paragraphs.length) return undefined;
  return { ...metadata, paragraphs: mapReaderParagraphs(paragraphs) };
}

export function mapReaderParagraphs(paragraphs: ReligiousTextParagraphRecord[]) {
  return [...paragraphs].sort((a, b) => a.position - b.position).map((p) => ({
    ...(p.block_kind ? { kind: p.block_kind } : {}),
    ...(p.translation_en ? { translation_en: p.translation_en } : {}),
    arabic: p.arabic, transliteration: p.transliteration, translation_de: p.translation_de,
  }));
}
