import type { VerificationStatus } from '@/domain/types';
import { allPlaces } from '@/data/places';
import { recommendedActs } from '@/data/recommendedActs';
import { religiousContent } from '@/data/religiousContent';
import { getSourceReferencesByIds } from '@/data/sourceReferences';
import { translate, type Language } from '@/features/i18n/i18n';
import {
  formatPlaceLocation,
  localizePlace,
  localizeRecommendedAct,
  localizeReligiousContent,
  localizeSourceReferences,
} from '@/features/i18n/localizedData';

export type SearchFilter = 'all' | 'places' | 'content' | 'acts';

type SearchResultBase = {
  description: string;
  id: string;
  subtitle: string;
  title: string;
  verificationStatus: VerificationStatus;
};

export type SearchResult =
  | (SearchResultBase & { kind: 'place'; slug: string })
  | (SearchResultBase & { kind: 'content'; slug: string })
  | (SearchResultBase & { kind: 'act'; slug?: string });

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ـ/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .toLocaleLowerCase();
}

function matches(query: string, fields: string[]) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  return fields.some((field) => normalize(field).includes(normalizedQuery));
}

function sourceSearchFields(sourceIds: string[], language: Language) {
  return localizeSourceReferences(getSourceReferencesByIds(sourceIds), language).flatMap((source) => [
    source.title,
    source.bookOrWebsite ?? '',
    source.url ?? '',
    source.quotedExcerpt ?? '',
    source.notes,
  ]);
}

export function searchCatalog(
  query: string,
  filter: SearchFilter,
  language: Language = 'de',
): SearchResult[] {
  const placeResults =
    filter === 'all' || filter === 'places'
      ? allPlaces
          .map((place) => localizePlace(place, language))
          .filter((place) =>
            matches(query, [
              place.name,
              place.shortDescription,
              place.longDescription,
              formatPlaceLocation(place, language, true),
              place.city,
              place.category,
              ...place.alternativeNames,
              ...sourceSearchFields(place.sourceReferences, language),
            ]),
          )
          .map((place) => ({
            description: place.shortDescription,
            id: place.id,
            kind: 'place' as const,
            slug: place.slug,
            subtitle: formatPlaceLocation(place, language),
            title: place.name,
            verificationStatus: place.verificationStatus,
          }))
      : [];

  const contentResults =
    filter === 'all' || filter === 'content'
      ? religiousContent
          .map((content) => localizeReligiousContent(content, language))
          .filter((content) =>
            matches(query, [
              content.title,
              content.type,
              ...content.paragraphs.flatMap((paragraph) => [
                paragraph.arabic,
                paragraph.transliteration,
                paragraph.translation_de,
              ]),
              ...sourceSearchFields(content.sourceReferences, language),
            ]),
          )
          .map((content) => ({
            description: content.notes,
            id: content.id,
            kind: 'content' as const,
            slug: content.slug,
            subtitle: translate(language, `labels.contentType.${content.type}`),
            title: content.title,
            verificationStatus: content.verificationStatus,
          }))
      : [];

  const actResults =
    filter === 'all' || filter === 'acts'
      ? recommendedActs
          .map((act) => localizeRecommendedAct(act, language))
          .filter((act) =>
            matches(query, [
              act.title,
              act.type,
              act.shortInstruction,
              ...sourceSearchFields(act.sourceReferences, language),
            ]),
          )
          .map((act) => ({
            description: act.shortInstruction,
            id: act.id,
            kind: 'act' as const,
            slug: act.contentId,
            subtitle: translate(language, `labels.actType.${act.type}`),
            title: act.title,
            verificationStatus: act.verificationStatus,
          }))
      : [];

  return [...placeResults, ...contentResults, ...actResults];
}
