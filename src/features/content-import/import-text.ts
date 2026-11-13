import type { TextParagraph } from '@/domain/types';

export type ImportIssue = { index: number; reason: 'unassigned' | 'missingTransliteration' | 'missingTranslation' };
export type ImportResult = { paragraphs: TextParagraph[]; issues: ImportIssue[] };

export const emptyParagraph = (kind: TextParagraph['kind'] = 'text'): TextParagraph => ({
  kind, arabic: '', transliteration: '', translation_de: '', translation_en: '',
});

// Decode once: pasted text is content, never executable HTML.
export function normalizeImportedText(text: string) {
  return text.replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, code: string) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : entity;
    })
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, (entity) => ({
      '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    })[entity] ?? entity)
    .replace(/\r\n?/g, '\n');
}

const hasArabic = (text: string) => /\p{Script=Arabic}/u.test(text);
const isArabic = (text: string) => hasArabic(text) && !/\p{Script=Latin}/u.test(text);
const appendLine = (before: string, line: string) => before ? `${before}\n${line}` : line;

/** Plain sources use Arabic, transliteration and English on successive lines.
 * Explicit italic transliteration in existing Markdown sources remains supported.
 * Text outside that sequence stays visible and requires an explicit decision.
 */
export function importMixedText(raw: string): ImportResult {
  const paragraphs: TextParagraph[] = [];
  const issues: ImportIssue[] = [];
  const plainTransliterations = new Set<TextParagraph>();
  let current: TextParagraph | undefined;
  let separated = false;

  for (const originalLine of normalizeImportedText(raw).split('\n')) {
    const line = originalLine.trim();
    if (!line) { separated = true; continue; }
    const heading = /^(#{1,6})\s+/.exec(line);
    const body = line.replace(/^#{1,6}\s+/, '');
    // ###### before italic text is a common source-site styling artefact.
    const italic = /^\*([^*]+)\*(?:\s*(.*))?$/.exec(body);
    if (italic && !hasArabic(italic[1])) {
      if (!current || current.kind !== 'text' || current.transliteration) {
        current = emptyParagraph();
        paragraphs.push(current);
        issues.push({ index: paragraphs.length - 1, reason: 'unassigned' });
      }
      current.transliteration = italic[1].trim();
      if (italic[2]) current.translation_en = appendLine(current.translation_en ?? '', italic[2]);
    } else if (heading || /^>\s?/.test(body)) {
      const block = emptyParagraph(heading ? 'heading' : 'note');
      const text = body.replace(/^>\s?/, '');
      if (isArabic(text)) block.arabic = text;
      else block.translation_en = text;
      paragraphs.push(block);
      current = undefined;
    } else if (isArabic(body)) {
      if (!current || current.kind !== 'text' || current.transliteration || current.translation_en || separated) {
        current = emptyParagraph();
        paragraphs.push(current);
      }
      current.arabic = appendLine(current.arabic, body);
    } else if (current?.kind === 'text' && current.arabic && !current.transliteration && !separated && !hasArabic(body)) {
      current.transliteration = body;
      plainTransliterations.add(current);
    } else if (current?.kind === 'text' && current.arabic && current.transliteration && !separated) {
      current.translation_en = appendLine(current.translation_en ?? '', body);
    } else {
      // Prose outside a text section's line sequence needs an explicit assignment.
      current = emptyParagraph('note');
      current.translation_en = body;
      paragraphs.push(current);
      issues.push({ index: paragraphs.length - 1, reason: 'unassigned' });
    }
    separated = false;
  }

  paragraphs.forEach((paragraph, index) => {
    if (paragraph.kind === 'text' && paragraph.arabic && !paragraph.transliteration) {
      issues.push({ index, reason: 'missingTransliteration' });
    } else if (plainTransliterations.has(paragraph) && !paragraph.translation_en?.trim()) {
      issues.push({ index, reason: 'missingTranslation' });
    }
  });
  return { paragraphs, issues };
}

/** Full German translations use blank lines between sections. A mismatch never
 * mutates the preview, preventing silent shifts after a missing translation.
 */
export function applyGermanTranslation(paragraphs: TextParagraph[], raw: string) {
  const sections = normalizeImportedText(raw).trim().split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const textCount = paragraphs.filter((p) => !p.kind || p.kind === 'text').length;
  if (sections.length !== textCount) return { paragraphs, matches: false, expected: textCount, actual: sections.length };
  let index = 0;
  return {
    paragraphs: paragraphs.map((p) => !p.kind || p.kind === 'text' ? { ...p, translation_de: sections[index++] } : p),
    matches: true, expected: textCount, actual: sections.length,
  };
}

export function stripInlineFormatting(text: string) {
  return text.replace(/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g, (_, bold: string, italic: string) => bold ?? italic);
}
