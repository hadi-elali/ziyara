import type { ReligiousContentRecord } from '@/domain/database';
import type { TextParagraph } from '@/domain/types';
import { supabase } from '@/features/auth/supabase';
import { withSupabaseReadTimeout } from '@/features/network/supabase-read';
import { mapReaderParagraphs } from '@/features/reader/religious-content-mapping';

export type ReaderDraft = {
  id: string; slug: string; title: string; notes: string;
  // Preserve stored classifications for schema compatibility, without exposing them in the editor.
  contentType: ReligiousContentRecord['content_type'];
  placeIds: string[]; sourceTitle: string; sourceUrl: string;
  rawText: string; rawGerman: string; parsedRaw: string;
  paragraphs: TextParagraph[]; unresolved: number[];
  updatedAt: string | null; wasPublished: boolean;
};

export function newReaderDraft(): ReaderDraft {
  const id = `reader-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id, slug: id, title: '', notes: '', contentType: 'ziyarah', placeIds: [], sourceTitle: '', sourceUrl: '',
    rawText: '', rawGerman: '', parsedRaw: '', paragraphs: [], unresolved: [],
    updatedAt: null, wasPublished: false,
  };
}

export async function listReaderDrafts() {
  const rows: ReligiousContentRecord[] = [];
  for (let from = 0; ; from += 100) {
    const { data, error } = await withSupabaseReadTimeout((signal) => supabase.from('religious_contents')
      .select('*').eq('is_imported', true).order('id').range(from, from + 99).abortSignal(signal));
    if (error) throw error;
    rows.push(...data ?? []);
    if ((data?.length ?? 0) < 100) return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

export async function readReaderDraft(id: string): Promise<ReaderDraft> {
  const { data: row, error: rowError } = await withSupabaseReadTimeout((signal) => supabase
    .from('religious_contents').select('*').eq('id', id).abortSignal(signal).single());
  if (rowError) throw rowError;
  const paragraphs = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await withSupabaseReadTimeout((signal) => supabase.from('religious_text_paragraphs')
      .select('*').eq('content_id', id).order('position').range(from, from + 499).abortSignal(signal));
    if (error) throw error;
    paragraphs.push(...data ?? []);
    if ((data?.length ?? 0) < 500) break;
  }
  const { data: original, error: originalError } = await withSupabaseReadTimeout((signal) => supabase
    .from('religious_content_imports').select('*').eq('content_id', id).abortSignal(signal).maybeSingle());
  if (originalError) throw originalError;
  return {
    id: row.id, slug: row.slug, title: row.title, notes: row.notes, contentType: row.content_type,
    placeIds: row.place_ids ?? [], sourceTitle: row.source_title ?? '', sourceUrl: row.source_url ?? '',
    rawText: original?.raw_text ?? '', parsedRaw: original?.raw_text ?? '',
    rawGerman: original?.raw_german ?? '',
    unresolved: original?.unresolved_blocks ?? [], paragraphs: mapReaderParagraphs(paragraphs),
    updatedAt: row.updated_at, wasPublished: row.is_published,
  };
}

export async function saveReaderDraft(draft: ReaderDraft, publish: boolean) {
  const { data, error } = await supabase.rpc('admin_save_reader_content', {
    p_content: {
      id: draft.id, slug: draft.slug.trim(), title: draft.title.trim(), notes: draft.notes,
      content_type: draft.contentType, place_ids: draft.placeIds, source_title: draft.sourceTitle.trim(),
      source_url: draft.sourceUrl.trim(), publish, unresolved_blocks: draft.unresolved,
    },
    p_paragraphs: draft.paragraphs, p_raw_text: draft.rawText, p_raw_german: draft.rawGerman,
    p_expected_updated_at: draft.updatedAt,
  });
  if (error) throw error;
  return data;
}
