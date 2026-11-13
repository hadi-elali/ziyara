import { describe, expect, it } from '@jest/globals';

import type {
  ReligiousContentRecord,
  ReligiousTextParagraphRecord,
} from '@/domain/database';
import { mapReligiousContentRows } from '@/features/reader/religious-content-mapping';

const content: ReligiousContentRecord = {
  content_policy: 'approved_for_offline',
  content_type: 'dua',
  created_at: '2026-09-14T00:00:00.000Z',
  id: 'structured-test',
  is_published: true,
  language: 'Arabisch',
  notes: 'Test notes',
  reviewed_at: '2026-09-14T00:00:00.000Z',
  reviewed_by: 'Reviewer',
  slug: 'structured-test',
  source_references: ['source-id'],
  title: 'Structured test',
  updated_at: '2026-09-14T00:00:00.000Z',
  verification_status: 'verified',
  version: '1.0.0',
};

function paragraph(
  id: number,
  position: number,
  arabic: string,
): ReligiousTextParagraphRecord {
  return {
    arabic,
    content_id: content.id,
    created_at: '2026-09-14T00:00:00.000Z',
    id,
    position,
    translation_de: `Deutsch ${position}`,
    transliteration: `Latin ${position}`,
  };
}

describe('religious content database mapping', () => {
  it('sorts whole paragraph records without separating their text components', () => {
    expect(mapReligiousContentRows(content, [paragraph(2, 1, 'Arabisch 1'), paragraph(1, 0, 'Arabisch 0')])?.paragraphs).toEqual([
      {
        arabic: 'Arabisch 0',
        translation_de: 'Deutsch 0',
        transliteration: 'Latin 0',
      },
      {
        arabic: 'Arabisch 1',
        translation_de: 'Deutsch 1',
        transliteration: 'Latin 1',
      },
    ]);
  });

  it('rejects incomplete or unverified remote content', () => {
    expect(mapReligiousContentRows(content, [])).toBeUndefined();
    expect(
      mapReligiousContentRows({ ...content, verification_status: 'needs_review' }, [
        paragraph(1, 0, 'Arabisch'),
      ]),
    ).toBeUndefined();
  });
  it('loads a published import without pretending that it was verified', () => {
    const imported = mapReligiousContentRows({ ...content, is_imported: true,
      verification_status: 'needs_review', content_policy: 'pending_rights_review',
      reviewed_at: null, reviewed_by: null, source_title: '', source_url: '',
      source_references: ['editorial-review-required'],
    }, [paragraph(1, 0, 'نص تجريبي')]);
    expect(imported).toMatchObject({ isImported: true, verificationStatus: 'needs_review',
      contentPolicy: 'pending_rights_review', sources: [], sourceReferences: ['editorial-review-required'] });
    expect(imported?.reviewedAt).toBeUndefined();
    expect(imported?.reviewedBy).toBeUndefined();
  });
  it('does not expose an unpublished or rejected import', () => {
    const row = { ...content, is_imported: true, verification_status: 'needs_review' as const, content_policy: 'pending_rights_review' as const };
    expect(mapReligiousContentRows({ ...row, is_published: false }, [paragraph(1, 0, 'نص تجريبي')])).toBeUndefined();
    expect(mapReligiousContentRows({ ...row, verification_status: 'rejected' }, [paragraph(1, 0, 'نص تجريبي')])).toBeUndefined();
  });
});
