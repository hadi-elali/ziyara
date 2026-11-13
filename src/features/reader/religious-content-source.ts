import { useCallback, useEffect, useMemo, useState } from 'react';

import { getReligiousContentBySlug } from '@/data/religiousContent';
import type { ReligiousContent } from '@/domain/types';
import type { ReligiousTextParagraphRecord } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import {
  getOriginalErrorMessage,
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { mapReligiousContentRows } from '@/features/reader/religious-content-mapping';
import { usePublishedReaderCache } from './imported-content-catalog';

export async function loadPublishedReligiousContent(slug: string) {
  const { data: content, error: contentError } = await withSupabaseReadTimeout((signal) =>
    supabase
      .from('religious_contents')
      .select(
        '*',
      )
      .eq('slug', slug)
      .eq('is_published', true)
      .abortSignal(signal)
      .maybeSingle(),
  );

  if (contentError) {
    throw contentError;
  }

  if (!content) {
    return undefined;
  }

  const paragraphs: ReligiousTextParagraphRecord[] = [];
  for (let from = 0; ; from += 500) {
    const { data: page, error } = await withSupabaseReadTimeout((signal) => supabase
      .from('religious_text_paragraphs').select('*').eq('content_id', content.id)
      .order('position').range(from, from + 499).abortSignal(signal));
    if (error) throw error;
    paragraphs.push(...page ?? []);
    if ((page?.length ?? 0) < 500) break;
  }

  return mapReligiousContentRows(content, paragraphs);
}

type RemoteContentState = {
  content?: ReligiousContent;
  errorKind: SupabaseReadFailureKind | null;
  errorMessage: string | null;
  isLoading: boolean;
  slug?: string;
};

export function useReligiousContent(slug?: string) {
  const bundledContent = useMemo(() => getReligiousContentBySlug(slug), [slug]);
  const [{ contents: cachedContents }, setCachedContents] = usePublishedReaderCache();
  const cachedContent = cachedContents.find((item) => item.slug === slug && item.paragraphs.length > 0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [remoteState, setRemoteState] = useState<RemoteContentState>({
    errorKind: null,
    errorMessage: null,
    isLoading: Boolean(slug),
  });

  useEffect(() => {
    let isCurrent = true;

    if (!slug) {
      void Promise.resolve().then(() => {
        if (isCurrent) {
          setRemoteState({ errorKind: null, errorMessage: null, isLoading: false });
        }
      });
      return () => {
        isCurrent = false;
      };
    }

    void Promise.resolve().then(() => {
      if (isCurrent) {
        setRemoteState({ errorKind: null, errorMessage: null, isLoading: true, slug });
      }
    });
    void loadPublishedReligiousContent(slug)
      .then((content) => {
        if (isCurrent) {
          if (content?.sources) setCachedContents((previous) => ({ ...previous,
            contents: [...previous.contents.filter((p) => p.id !== content.id), content],
          }));
          else if (!content) setCachedContents((previous) => ({ ...previous,
            contents: previous.contents.filter((p) => p.slug !== slug),
          }));
          setRemoteState({ content, errorKind: null, errorMessage: null, isLoading: false, slug });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setRemoteState({
            errorKind: getSupabaseReadFailureKind(error),
            errorMessage: getOriginalErrorMessage(error),
            isLoading: false,
            slug,
          });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [refreshVersion, slug, setCachedContents]);

  const refresh = useCallback(() => setRefreshVersion((current) => current + 1), []);
  const stateMatchesSlug = remoteState.slug === slug;

  return {
    content: stateMatchesSlug && !remoteState.isLoading && !remoteState.errorKind
      ? remoteState.content ?? bundledContent
      : cachedContent ?? bundledContent,
    errorKind: stateMatchesSlug ? remoteState.errorKind : null,
    errorMessage: stateMatchesSlug ? remoteState.errorMessage : null,
    isLoading: !bundledContent && !cachedContent && (!stateMatchesSlug || remoteState.isLoading),
    refresh,
  };
}
