import type { SourceReference } from '@/domain/types';

export const sourceReferences: SourceReference[] = [
  {
    id: 'duas-ziyarat-nahiya',
    title: 'duas.org: Ziyarah Nahiya',
    bookOrWebsite: 'duas.org',
    url: 'https://www.duas.org/ziaratnahiya.htm',
    language: 'Arabisch / Englisch',
    quotedExcerpt: 'Salutation on Imam Hussain(as) by Imam Mahdi(ajtfs)',
    contentPolicy: 'linked_not_copied',
    lastCheckedAt: '2026-07-03',
    notes:
      'duas.org beschreibt diese Ziyarah als Salutation für Imam Hussain und verweist in der Einleitung auf al-Mazar al-Kabir sowie Bihar al-Anwar.',
  },
  {
    id: 'duas-ziyarat-arbaeen',
    title: 'duas.org: Ziyarat Arbaeen',
    bookOrWebsite: 'duas.org',
    url: 'https://www.duas.org/ziyarat-arbaeen.html',
    language: 'Arabisch / Englisch',
    quotedExcerpt: 'Recited on 20th Safar-40th Day after Ashura',
    contentPolicy: 'linked_not_copied',
    lastCheckedAt: '2026-07-03',
    notes:
      'duas.org ordnet Ziyarat Arbaeen dem 20. Safar zu und nennt auf der Seite Überlieferungsangaben über Shaykh al-Tusi.',
  },
  {
    id: 'duas-ziyarat-ashura',
    title: 'duas.org: Ziyarat Ashura',
    bookOrWebsite: 'duas.org',
    url: 'https://www.duas.org/ziaratashura.htm',
    language: 'Arabisch / Englisch',
    quotedExcerpt: 'This Ziyarat is recited for Imam Hussain(as) on the day of Ashura & everyday.',
    contentPolicy: 'approved_for_offline',
    lastCheckedAt: '2026-09-14',
    notes:
      'duas.org beschreibt Ziyarat Ashura als Ziyarat für Imam Hussain am Tag von Ashura und für die tägliche Rezitation.',
  },
  {
    id: 'duas-dua-alqama-safwan',
    title: 'duas.org: Dua Alqama / Safwan',
    bookOrWebsite: 'duas.org',
    url: 'https://www.duas.org/alqama.htm',
    language: 'Arabisch / Englisch',
    quotedExcerpt: 'Dua Alqama (Safwan) recited after Ziarat Ashura',
    contentPolicy: 'linked_not_copied',
    lastCheckedAt: '2026-07-03',
    notes:
      'duas.org erklärt, dass diese Dua nach Ziyarat Ashura rezitiert wird und auch als Dua Safwan bekannt ist.',
  },
  {
    id: 'duas-ziyarat-ameenallah',
    title: 'duas.org: Ziyarat Ameenallah',
    bookOrWebsite: 'duas.org',
    url: 'https://www.duas.org/ziyarat-ameenallah.html',
    language: 'Arabisch / Englisch',
    quotedExcerpt: 'Ziyarat Ameenallah',
    contentPolicy: 'linked_not_copied',
    lastCheckedAt: '2026-07-03',
    notes:
      'duas.org stellt eine eigene Seite für Ziyarat Ameenallah bereit. Der Eintrag bleibt bis zur fachlichen Prüfung als zu prüfen markiert.',
  },
  {
    id: 'editorial-review-required',
    title: 'Redaktionelle Prüfung erforderlich',
    notes:
      'Interner Hinweis: Inhalte ohne geprüfte Primärquelle oder Rechteprüfung dürfen nicht als verifiziert angezeigt werden.',
  },
];

export function getSourceReferenceById(id: string) {
  return sourceReferences.find((source) => source.id === id);
}

export function getSourceReferencesByIds(ids: string[]) {
  return ids
    .map((id) => getSourceReferenceById(id))
    .filter((source): source is SourceReference => Boolean(source));
}
