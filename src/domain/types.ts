export type VerificationStatus = 'draft' | 'needs_review' | 'verified' | 'rejected';

export type SourceContentPolicy =
  | 'linked_not_copied'
  | 'pending_rights_review'
  | 'approved_for_offline';

export type PlaceCategory =
  | 'shrine'
  | 'mosque'
  | 'cemetery'
  | 'landmark'
  | 'maqam'
  | 'historic_site';

export type RecommendedActType =
  | 'ziyarah'
  | 'dua'
  | 'prayer'
  | 'recitation'
  | 'instruction'
  | 'etiquette';

export type ReligiousContentType = 'dua' | 'ziyarah' | 'salawat' | 'surah' | 'instruction';

export type TextParagraph = {
  arabic: string;
  transliteration: string;
  translation_de: string;
};

export type SourceReference = {
  id: string;
  title: string;
  author?: string;
  bookOrWebsite?: string;
  volume?: string;
  page?: string;
  url?: string;
  publisher?: string;
  language?: string;
  quotedExcerpt?: string;
  contentPolicy?: SourceContentPolicy;
  lastCheckedAt?: string;
  notes: string;
};

export type RecommendedAct = {
  id: string;
  title: string;
  type: RecommendedActType;
  shortInstruction: string;
  contentId?: string;
  recommendedAtPlaceId: string;
  priority: number;
  sourceReferences: string[];
  verificationStatus: VerificationStatus;
};

export type ReligiousContent = {
  id: string;
  slug: string;
  title: string;
  type: ReligiousContentType;
  paragraphs: TextParagraph[];
  language: string;
  notes: string;
  sourceReferences: string[];
  verificationStatus: VerificationStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  version: string;
};

export type PlaceImage = {
  id: string;
  asset?: number;
  uri?: string;
  description: string;
  source: {
    title: string;
    url: string;
  };
};

export type Place = {
  id: string;
  slug: string;
  name: string;
  alternativeNames: string[];
  city: string;
  province: string;
  country: 'Iraq';
  latitude: number;
  longitude: number;
  category: PlaceCategory;
  shortDescription: string;
  longDescription: string;
  historicalNotes: string;
  recommendedActs: string[];
  relatedContentIds: string[];
  visitingTips: string[];
  openingInfo: string;
  accessibilityNotes: string;
  images: PlaceImage[];
  sourceReferences: string[];
  verificationStatus: VerificationStatus;
};
