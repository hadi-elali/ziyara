import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { ReligiousContent } from '@/domain/types';
import { supabase } from '@/features/auth/supabase';
import { getOriginalErrorMessage, withSupabaseReadTimeout } from '@/features/network/supabase-read';
import { createPersistentState } from '@/features/storage/persistentState';
import { mapReligiousContentMetadata } from './religious-content-mapping';

export function parsePublishedReaderCache(value: unknown): ReligiousContent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item: Partial<ReligiousContent> | null) => item && item.isRemote === true
    && ((item.verificationStatus === 'verified' && (item.contentPolicy === undefined || item.contentPolicy === 'approved_for_offline'))
      || (item.isImported === true && item.verificationStatus === 'needs_review' && item.contentPolicy === 'pending_rights_review'))
    && typeof item.slug === 'string'
    && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.notes === 'string'
    && typeof item.language === 'string' && ['dua', 'ziyarah', 'salawat', 'surah', 'instruction'].includes(item.type ?? '')
    && (item.sources === undefined || (Array.isArray(item.sources) && item.sources.every((source) => source
      && typeof source.id === 'string' && typeof source.title === 'string' && typeof source.notes === 'string'
      && (source.url === undefined || typeof source.url === 'string'))))
    && Array.isArray(item.sourceReferences) && item.sourceReferences.every((id) => typeof id === 'string')
    && Array.isArray(item.placeIds) && item.placeIds.every((id) => typeof id === 'string')
    && Array.isArray(item.paragraphs) && item.paragraphs.every((p) => p && typeof p.arabic === 'string'
      && typeof p.transliteration === 'string' && typeof p.translation_de === 'string'
      && (p.kind === undefined || ['text', 'introduction', 'heading', 'note'].includes(p.kind))
      && (p.translation_en === undefined || typeof p.translation_en === 'string')))
    ? value as ReligiousContent[] : undefined;
}

export type PublishedReaderSnapshot = {
  contents: ReligiousContent[];
  hasCatalogSnapshot: boolean;
};

export function parsePublishedReaderSnapshot(value: unknown): PublishedReaderSnapshot | undefined {
  // Earlier clients persisted the contents array directly, including confirmed empty results.
  if (Array.isArray(value)) {
    const contents = parsePublishedReaderCache(value);
    return contents ? { contents, hasCatalogSnapshot: true } : undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<PublishedReaderSnapshot>;
  const contents = parsePublishedReaderCache(candidate.contents);
  return contents && typeof candidate.hasCatalogSnapshot === 'boolean'
    ? { contents, hasCatalogSnapshot: candidate.hasCatalogSnapshot } : undefined;
}

// Keep readiness alongside the data so that a confirmed empty result also survives navigation/restarts.
// Contains only published reader data. Admin drafts and originals never enter this cache.
export const usePublishedReaderCache = createPersistentState<PublishedReaderSnapshot>(
  'ziyara.published-reader.v1', { contents: [], hasCatalogSnapshot: false }, parsePublishedReaderSnapshot,
);

export function useImportedContentCatalog() {
  const [snapshot, setSnapshot, cacheLoaded] = usePublishedReaderCache();
  const { contents, hasCatalogSnapshot } = snapshot;
  const [isFetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setFetching(true);
    setError(null);
    try {
      const next: ReligiousContent[] = [];
      for (let from = 0; ; from += 200) {
        const { data, error: readError } = await withSupabaseReadTimeout((signal) => supabase
          .from('religious_contents').select('*').eq('is_published', true).eq('is_imported', true)
          .order('id').range(from, from + 199).abortSignal(signal));
        if (readError) throw readError;
        for (const row of data ?? []) {
          const item = mapReligiousContentMetadata(row);
          if (item) next.push(item);
        }
        if ((data?.length ?? 0) < 200) break;
      }
      if (sequence.current === request) setSnapshot((previous) => ({
        contents: next.map((item) => {
          const cached = previous.contents.find((p) => p.id === item.id && p.updatedAt === item.updatedAt);
          return cached ? { ...item, paragraphs: cached.paragraphs } : item;
        }),
        hasCatalogSnapshot: true,
      }));
    } catch (cause) {
      if (sequence.current === request) setError(getOriginalErrorMessage(cause));
    } finally {
      if (sequence.current === request) setFetching(false);
    }
  }, [setSnapshot]);
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { sequence.current += 1; };
  }, [refresh]));
  const hasUsableData = hasCatalogSnapshot || contents.length > 0;
  return {
    contents, error, refresh,
    isLoading: cacheLoaded && isFetching && !hasUsableData,
    isRefreshing: isFetching && hasUsableData,
  };
}
