import type { ReligiousContent } from '@/domain/types';
import { ziyaratAshuraParagraphs } from '@/data/ziyaratAshura';

const placeholder =
  'Volltext wird nach Rechte- und Inhaltsprüfung ergänzt. Quelle siehe unten.';
const placeholderParagraph = {
  arabic: placeholder,
  transliteration: placeholder,
  translation_de: placeholder,
};

export const religiousContent: ReligiousContent[] = [
  {
    id: 'ziyarat-ashura',
    slug: 'ziyarat-ashura',
    title: 'Ziyarat Ashura',
    type: 'ziyarah',
    paragraphs: ziyaratAshuraParagraphs,
    language: 'Arabisch',
    notes:
      'Ziyarat Ashura für Imam Hussain (a.). Der geprüfte Text ist absatzweise mit Arabisch, Transliteration und vorhandener deutscher Übersetzung hinterlegt.',
    sourceReferences: ['duas-ziyarat-ashura'],
    verificationStatus: 'verified',
    reviewedBy: 'Projektinhaber',
    reviewedAt: '2026-09-14',
    version: '1.0.0',
  },
  {
    id: 'ziyarah-imam-hussain-placeholder',
    slug: 'ziyarah-imam-hussain-placeholder',
    title: 'Ziyarah Nahiya für Imam Hussain',
    type: 'ziyarah',
    paragraphs: [placeholderParagraph],
    language: 'Arabisch',
    notes:
      'Quellengebundener Eintrag nach duas.org. Der vollständige Text wird nicht in die App kopiert, bis Rechte- und Inhaltsprüfung abgeschlossen sind.',
    sourceReferences: ['duas-ziyarat-nahiya'],
    verificationStatus: 'needs_review',
    version: '0.1.0',
  },
  {
    id: 'ziyarah-imam-ali-placeholder',
    slug: 'ziyarah-imam-ali-placeholder',
    title: 'Ziyarat Ameenallah für Imam Ali',
    type: 'ziyarah',
    paragraphs: [placeholderParagraph],
    language: 'Arabisch',
    notes:
      'Quellengebundener Eintrag nach duas.org. Der vollständige Text wird nicht in die App kopiert, bis Rechte- und Inhaltsprüfung abgeschlossen sind.',
    sourceReferences: ['duas-ziyarat-ameenallah'],
    verificationStatus: 'needs_review',
    version: '0.1.0',
  },
  {
    id: 'ziyarat-arbaeen-placeholder',
    slug: 'ziyarat-arbaeen-placeholder',
    title: 'Ziyarat Arbaeen',
    type: 'ziyarah',
    paragraphs: [placeholderParagraph],
    language: 'Deutsch',
    notes:
      'duas.org ordnet diese Ziyarah dem 20. Safar zu. Der vollständige Text wird erst nach Rechte- und Inhaltsprüfung offline ergänzt.',
    sourceReferences: ['duas-ziyarat-arbaeen'],
    verificationStatus: 'needs_review',
    version: '0.1.0',
  },
  {
    id: 'dua-safwan-placeholder',
    slug: 'dua-safwan-placeholder',
    title: 'Dua Safwan / Alqama nach Ziyarat Ashura',
    type: 'dua',
    paragraphs: [placeholderParagraph],
    language: 'Deutsch',
    notes:
      'duas.org beschreibt diese Dua als nach Ziyarat Ashura rezitiert und als Dua Safwan bekannt. Volltext folgt nach Rechte- und Inhaltsprüfung.',
    sourceReferences: ['duas-dua-alqama-safwan'],
    verificationStatus: 'needs_review',
    version: '0.1.0',
  },
];

export function getReligiousContentBySlug(slug?: string) {
  const migratedSlug =
    slug === 'general-ziyarah-etiquette-placeholder'
      ? 'ziyarat-arbaeen-placeholder'
      : slug === 'two-rakat-prayer-placeholder'
        ? 'dua-safwan-placeholder'
        : slug;

  return religiousContent.find(
    (content) => content.slug === migratedSlug || content.id === migratedSlug,
  );
}
