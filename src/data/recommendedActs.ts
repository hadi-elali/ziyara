import type { RecommendedAct } from '@/domain/types';

function twoRakatPrayerAct(
  id: string,
  recommendedAtPlaceId: string,
  priority = 1,
): RecommendedAct {
  return {
    id,
    title: 'Gebet mit zwei Rakʿah verrichten',
    type: 'prayer',
    shortInstruction:
      'Verrichte an diesem Schrein ein Gebet mit zwei Rakʿah als empfohlene Handlung.',
    recommendedAtPlaceId,
    priority,
    sourceReferences: ['editorial-review-required'],
    verificationStatus: 'needs_review',
  };
}

export const recommendedActs: RecommendedAct[] = [
  {
    id: 'act-ziyarat-ashura-imam-hussain',
    title: 'Ziyarat Ashura lesen',
    type: 'ziyarah',
    shortInstruction:
      'Lies Ziyarat Ashura für Imam Hussain (a.) in der abschnittsweisen Ansicht.',
    contentId: 'ziyarat-ashura',
    recommendedAtPlaceId: 'place-imam-hussain',
    priority: 1,
    sourceReferences: ['duas-ziyarat-ashura'],
    verificationStatus: 'verified',
  },
  twoRakatPrayerAct('act-two-rakat-imam-hussain', 'place-imam-hussain', 3),
  {
    id: 'act-ziyarat-arbaeen-imam-hussain',
    title: 'Ziyarat Arbaeen am 20. Safar prüfen',
    type: 'ziyarah',
    shortInstruction: 'duas.org ordnet Ziyarat Arbaeen dem 20. Safar zu.',
    contentId: 'ziyarat-arbaeen-placeholder',
    recommendedAtPlaceId: 'place-imam-hussain',
    priority: 4,
    sourceReferences: ['duas-ziyarat-arbaeen'],
    verificationStatus: 'needs_review',
  },
  twoRakatPrayerAct('act-two-rakat-abul-fadhl-abbas', 'place-abul-fadhl-abbas'),
  twoRakatPrayerAct('act-two-rakat-hur', 'place-hur'),
  {
    id: 'act-ziyarah-imam-ali',
    title: 'Ziyarat Ameenallah über duas.org prüfen',
    type: 'ziyarah',
    shortInstruction: 'Quelle: duas.org. Volltext erst nach Rechte- und Inhaltsprüfung offline ergänzen.',
    contentId: 'ziyarah-imam-ali-placeholder',
    recommendedAtPlaceId: 'place-imam-ali',
    priority: 1,
    sourceReferences: ['duas-ziyarat-ameenallah'],
    verificationStatus: 'needs_review',
  },
  twoRakatPrayerAct('act-two-rakat-imam-ali', 'place-imam-ali', 2),
  twoRakatPrayerAct('act-two-rakat-muslim-ibn-aqil', 'place-muslim-ibn-aqil'),
  twoRakatPrayerAct('act-two-rakat-hani-ibn-urwah', 'place-hani-ibn-urwah'),
  twoRakatPrayerAct('act-two-rakat-maytham', 'place-maytham'),
  twoRakatPrayerAct('act-two-rakat-kadhimayn', 'place-kadhimayn'),
  twoRakatPrayerAct('act-two-rakat-askari', 'place-askari'),
];

export function getRecommendedActsForPlace(placeId: string) {
  return recommendedActs
    .filter((act) => act.recommendedAtPlaceId === placeId)
    .sort((a, b) => a.priority - b.priority);
}
