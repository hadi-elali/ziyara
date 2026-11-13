import { afterEach, beforeAll, beforeEach, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { parsePublishedReaderCache, parsePublishedReaderSnapshot, useImportedContentCatalog, usePublishedReaderCache } from './imported-content-catalog';
import type { ReligiousContentRecord } from '@/domain/database';
import type { ReligiousContent } from '@/domain/types';

type Reply = { data: ReligiousContentRecord[] | null; error: Error | null };
const mockRead = jest.fn<() => Promise<Reply>>();
jest.mock('@/features/auth/supabase', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, neq: () => query, order: () => query, range: () => query, abortSignal: () => mockRead() };
  return query;
} } }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => () => void) => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  useEffect(callback, [callback]);
} }));

const row: ReligiousContentRecord = {
  is_imported: true,
  id: 'import-test', slug: 'import-test', title: 'Reader sample', language: 'Arabic', notes: '',
  content_type: 'ziyarah', content_policy: 'approved_for_offline', source_references: ['test-source'],
  verification_status: 'verified', reviewed_at: '2026-11-13', reviewed_by: 'reviewer', version: '1',
  is_published: true, created_at: '2026-11-13', updated_at: '2026-11-13T12:00:00Z',
  source_title: 'Editorial test source', place_ids: ['place-imam-hussain'],
};
let latest: ReturnType<typeof useImportedContentCatalog>;
let setCache: ReturnType<typeof usePublishedReaderCache>[1];
let renderer: ReactTestRenderer | undefined;
function Harness() {
  const value = useImportedContentCatalog();
  const [, set] = usePublishedReaderCache();
  useEffect(() => { latest = value; setCache = set; }, [value, set]);
  return null;
}
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => { await act(async () => { renderer?.unmount(); setCache?.({ contents: [], hasCatalogSnapshot: false }); }); });

it('shows initial loading until the first catalog result arrives', async () => {
  let finish!: (reply: Reply) => void;
  mockRead.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { renderer = create(<Harness />); });
  expect(latest.isLoading).toBe(true);
  await act(async () => finish({ data: [row], error: null }));
  expect(latest.isLoading).toBe(false);
  expect(latest.isRefreshing).toBe(false);
});

it('refreshes an already visible catalog without re-entering initial loading', async () => {
  mockRead.mockResolvedValue({ data: [row], error: null });
  await act(async () => { renderer = create(<Harness />); });
  let finish!: (reply: Reply) => void;
  mockRead.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = latest.refresh(); });
  expect(latest.contents.map((item) => item.id)).toEqual([row.id]);
  expect(latest.isLoading).toBe(false);
  expect(latest.isRefreshing).toBe(true);
  await act(async () => { finish({ data: [row], error: null }); await pending; });
});

it('keeps a confirmed empty result ready when returning to a remounted screen', async () => {
  mockRead.mockResolvedValue({ data: [], error: null });
  await act(async () => { renderer = create(<Harness />); });
  await act(async () => { renderer?.unmount(); });
  let finish!: (reply: Reply) => void;
  mockRead.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { renderer = create(<Harness />); });
  expect(latest.contents).toEqual([]);
  expect(latest.isLoading).toBe(false);
  expect(latest.isRefreshing).toBe(true);
  await act(async () => finish({ data: [], error: null }));
});

it('invalidates outdated bodies, keeps the last published metadata offline, and removes withdrawn entries after a successful refresh', async () => {
  mockRead.mockResolvedValue({ data: [row], error: null });
  await act(async () => { renderer = create(<Harness />); });
  expect(latest.contents[0].sources?.[0].title).toBe('Editorial test source');
  await act(async () => setCache((snapshot) => ({ ...snapshot, contents: snapshot.contents.map((item) => ({ ...item,
    paragraphs: [{ arabic: '', transliteration: '', translation_de: 'Previously read body' }],
  })) })));
  mockRead.mockResolvedValue({ data: [{ ...row, updated_at: '2026-11-13T13:00:00Z' }], error: null });
  await act(async () => latest.refresh());
  expect(latest.contents[0].paragraphs).toEqual([]);
  mockRead.mockResolvedValue({ data: null, error: new Error('Offline fixture') });
  await act(async () => latest.refresh());
  expect(latest.contents).toHaveLength(1);
  expect(latest.error).toBe('Offline fixture');
  mockRead.mockResolvedValue({ data: [], error: null });
  await act(async () => latest.refresh());
  expect(latest.contents).toEqual([]);
});

it('ignores an older request that completes after a newer confirmed list', async () => {
  mockRead.mockResolvedValue({ data: [], error: null });
  await act(async () => { renderer = create(<Harness />); });
  let resolveOlder!: (reply: Reply) => void;
  mockRead.mockImplementationOnce(() => new Promise((resolve) => { resolveOlder = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = latest.refresh(); });
  mockRead.mockResolvedValue({ data: [row], error: null });
  await act(async () => latest.refresh());
  await act(async () => { resolveOlder({ data: [], error: null }); await pending; });
  expect(latest.contents.map((item) => item.id)).toEqual([row.id]);
});

it('rejects draft or malformed persisted data', () => {
  const draft: Partial<ReligiousContent> = { isRemote: true, verificationStatus: 'needs_review' };
  expect(parsePublishedReaderCache([draft])).toBeUndefined();
  expect(parsePublishedReaderCache([null])).toBeUndefined();
  expect(parsePublishedReaderCache('bad JSON value')).toBeUndefined();
});
it('migrates a persisted empty catalog and validates its readiness marker', () => {
  expect(parsePublishedReaderSnapshot([])).toEqual({ contents: [], hasCatalogSnapshot: true });
  expect(parsePublishedReaderSnapshot({ contents: [], hasCatalogSnapshot: false }))
    .toEqual({ contents: [], hasCatalogSnapshot: false });
  expect(parsePublishedReaderSnapshot({ contents: [], hasCatalogSnapshot: 'true' })).toBeUndefined();
  expect(parsePublishedReaderSnapshot({ contents: [{}], hasCatalogSnapshot: true })).toBeUndefined();
});
it('caches a published import with its actual pending review status', async () => {
  mockRead.mockResolvedValue({ data: [{ ...row, source_title: '', source_url: '',
    verification_status: 'needs_review', content_policy: 'pending_rights_review', reviewed_at: null, reviewed_by: null,
  }], error: null });
  await act(async () => { renderer = create(<Harness />); });
  const parsed = parsePublishedReaderCache(latest.contents);
  expect(parsed?.[0]).toMatchObject({ isImported: true, verificationStatus: 'needs_review', contentPolicy: 'pending_rights_review' });
  expect(parsePublishedReaderCache(latest.contents.map((item) => ({ ...item, isImported: false })))).toBeUndefined();
});
