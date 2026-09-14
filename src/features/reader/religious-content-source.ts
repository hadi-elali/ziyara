import { useCallback, useEffect, useMemo, useState } from 'react';

import { getReligiousContentBySlug } from '@/data/religiousContent';
import type { ReligiousContent } from '@/domain/types';
import { supabase } from '@/features/auth/supabase';
import {
  getSupabaseReadFailureKind,
  type SupabaseReadFailureKind,
  withSupabaseReadTimeout,
} from '@/features/network/supabase-read';
import { mapReligiousContentRows } from '@/features/reader/religious-content-mapping';

export async function loadPublishedReligiousContent(slug: string) {
  const { data: content, error: contentError } = await withSupabaseReadTimeout((signal) =>
    supabase
      .from('religious_contents')
      .select(
        'id, slug, title, content_type, language, notes, source_references, verification_status, content_policy, reviewed_by, reviewed_at, version, is_published, created_at, updated_at',
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

  const { data: paragraphs, error: paragraphsError } = await withSupabaseReadTimeout((signal) =>
    supabase
      .from('religious_text_paragraphs')
      .select('id, content_id, position, arabic, transliteration, translation_de, created_at')
      .eq('content_id', content.id)
      .order('position')
      .abortSignal(signal),
  );

  if (paragraphsError) {
    throw paragraphsError;
  }

  return mapReligiousContentRows(content, paragraphs ?? []);
}

type RemoteContentState = {
  content?: ReligiousContent;
  errorKind: SupabaseReadFailureKind | null;
  isLoading: boolean;
  slug?: string;
};

export function useReligiousContent(slug?: string) {
  const bundledContent = useMemo(() => getReligiousContentBySlug(slug), [slug]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [remoteState, setRemoteState] = useState<RemoteContentState>({
    errorKind: null,
    isLoading: Boolean(slug),
  });

  useEffect(() => {
    let isCurrent = true;

    if (!slug) {
      void Promise.resolve().then(() => {
        if (isCurrent) {
          setRemoteState({ errorKind: null, isLoading: false });
        }
      });
      return () => {
        isCurrent = false;
      };
    }

    void Promise.resolve().then(() => {
      if (isCurrent) {
        setRemoteState({ errorKind: null, isLoading: true, slug });
      }
    });
    void loadPublishedReligiousContent(slug)
      .then((content) => {
        if (isCurrent) {
          setRemoteState({ content, errorKind: null, isLoading: false, slug });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setRemoteState({
            errorKind: getSupabaseReadFailureKind(error),
            isLoading: false,
            slug,
          });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [refreshVersion, slug]);

  const refresh = useCallback(() => setRefreshVersion((current) => current + 1), []);
  const stateMatchesSlug = remoteState.slug === slug;

  return {
    content: stateMatchesSlug && remoteState.content ? remoteState.content : bundledContent,
    errorKind: stateMatchesSlug ? remoteState.errorKind : null,
    isLoading: !bundledContent && (!stateMatchesSlug || remoteState.isLoading),
    refresh,
  };
}
