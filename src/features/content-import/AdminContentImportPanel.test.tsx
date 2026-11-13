import { afterEach, beforeAll, beforeEach, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';

import { AdminContentImportPanel } from './AdminContentImportPanel';
import { newReaderDraft, saveReaderDraft, type ReaderDraft } from './reader-content-admin';
import { Button } from '@/components/ui/button';

const mockList = jest.fn<() => Promise<unknown[]>>();
const mockRead = jest.fn<(id: string) => Promise<ReaderDraft>>();
const mockSave = jest.fn<typeof saveReaderDraft>();
jest.mock('./reader-content-admin', () => ({
  ...jest.requireActual<typeof import('./reader-content-admin')>('./reader-content-admin'),
  listReaderDrafts: () => mockList(), readReaderDraft: (id: string) => mockRead(id),
  saveReaderDraft: (...args: Parameters<typeof saveReaderDraft>) => mockSave(...args),
}));
jest.mock('@/features/auth/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ useNavigation: () => ({ dispatch: jest.fn() }), useFocusEffect: (callback: () => () => void) => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  useEffect(callback, [callback]);
} }));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ profile: { role: 'admin' } }) }));
jest.mock('react-native-enriched-markdown', () => jest.requireActual('react-native-enriched-markdown/jest'));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ language: 'de', isRTL: false, t: (key: string) => key }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ text: '#111', textSecondary: '#555', surface: '#fff', border: '#777', accent: '#176', accentSoft: '#dfd' }) }));
jest.mock('@/constants/theme', () => ({ Fonts: { serif: 'serif' }, Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 40 } }));
jest.mock('@/components/ui/screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/ui/button', () => ({ Button: (props: import('@/components/ui/button').ButtonProps) => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return <Pressable accessibilityLabel={props.label} disabled={props.disabled} onPress={props.onPress}><Text>{props.label}</Text></Pressable>;
} }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let renderer: ReactTestRenderer;
let alertSpy: { mockRestore: () => void };
beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  jest.clearAllMocks(); mockList.mockResolvedValue([]);
  mockSave.mockReset().mockImplementation(async (draft, publish) => ({ id: draft.id, title: draft.title, slug: draft.slug,
    is_published: publish, updated_at: '2026-11-13T12:00:00Z' } as Awaited<ReturnType<typeof saveReaderDraft>>));
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => { await act(async () => renderer?.unmount()); alertSpy.mockRestore(); });
const button = (label: string) => renderer.root.findAllByType(Button).find((node) => node.props.label === label)!;
const tap = async (label: string) => { await act(async () => button(label).props.onPress()); };
const input = async (label: string, value: string) => {
  await act(async () => renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label)!.props.onChangeText(value));
};
async function togglePlace() {
  await act(async () => {
    const choices = renderer.root.findAllByProps({ accessibilityRole: 'checkbox' });
    const place = choices.find((node) => node.props.accessibilityLabel === 'Schrein von Imam Hussain');
    if (!place) throw new Error(choices.map((node) => node.props.accessibilityLabel).join(', '));
    place.props.onPress();
  });
}
async function startNew(createPreview = true) {
  await act(async () => { renderer = create(<AdminContentImportPanel />); });
  await tap('contentImport.new');
  await input('contentImport.name', 'A complete title');
  await togglePlace();
  await input('contentImport.raw', 'نص تجريبي\nlatin sample\nEnglish sample');
  if (createPreview) await tap('contentImport.import');
}

it('imports a full source and saves all aligned components in a private draft', async () => {
  await startNew();
  mockSave.mockImplementation(async (draft) => ({ id: draft.id, title: draft.title, slug: draft.slug,
    is_published: false, updated_at: '2026-11-13T12:00:00Z' } as Awaited<ReturnType<typeof saveReaderDraft>>));
  await tap('contentImport.saveDraft');
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
    title: 'A complete title', slug: 'a-complete-title', placeIds: ['place-imam-hussain'],
    rawText: 'نص تجريبي\nlatin sample\nEnglish sample',
    paragraphs: [expect.objectContaining({ arabic: 'نص تجريبي', transliteration: 'latin sample', translation_en: 'English sample' })],
  }), false);
});

it('publishes a complete text without a source title or review switches', async () => {
  await startNew();
  mockSave.mockImplementation(async (draft) => ({ id: draft.id, title: draft.title, slug: draft.slug,
    is_published: true, verification_status: 'needs_review', updated_at: '2026-11-13T12:00:00Z' } as Awaited<ReturnType<typeof saveReaderDraft>>));
  const labels = renderer.root.findAllByType(TextInput).map((node) => node.props.accessibilityLabel);
  expect(labels).not.toContain('contentImport.sourceTitle');
  expect(labels).not.toContain('contentImport.notes');
  expect(labels).not.toContain('contentImport.german');
  expect(labels).toContain('contentImport.sourceUrl');
  expect(renderer.root.findAllByType(Button).some((node) => node.props.label === 'contentImport.cancel')).toBe(false);
  expect(button('contentImport.publish').props.disabled).toBe(false);
  await tap('contentImport.publish');
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ sourceTitle: '', sourceUrl: '' }), true);
});

it.each([false, true])('saves edited sections without recreating them when the original differs (publish: %s)', async (publish) => {
  await startNew();
  await tap('contentImport.edit');
  await input('contentImport.de', 'Manually edited translation');
  await input('contentImport.raw', 'Changed original');
  await tap(publish ? 'contentImport.publish' : 'contentImport.saveDraft');
  expect(alertSpy).not.toHaveBeenCalled();
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
    rawText: 'Changed original',
    paragraphs: [expect.objectContaining({ translation_en: 'English sample', translation_de: 'Manually edited translation' })],
  }), publish);
});

it('publishes accepted introductions and notes without resetting translations or assignments, including on retry', async () => {
  await startNew(false);
  const source = 'Introduction sample\n\nنص تجريبي\nlatin sample\nEnglish sample\n\nClosing sample';
  await input('contentImport.raw', source);
  await tap('contentImport.import');
  await tap('contentImport.edit');
  await act(async () => renderer.root.findAllByProps({ accessibilityRole: 'checkbox', accessibilityLabel: 'contentImport.kind.introduction' })[0].props.onPress());
  await input('contentImport.de', 'German introduction sample');
  expect(renderer.root.findAllByType(Button).filter((node) => node.props.label === 'contentImport.resolve')).toHaveLength(1);
  await act(async () => renderer.root.findAllByType(Button).filter((node) => node.props.label === 'contentImport.edit')[2].props.onPress());
  await input('contentImport.de', 'German closing sample');
  await act(async () => renderer.root.findAllByProps({ accessibilityRole: 'checkbox', accessibilityLabel: 'contentImport.kind.note' })[0].props.onPress());
  expect(renderer.root.findAllByType(Button).filter((node) => node.props.label === 'contentImport.resolve')).toHaveLength(0);
  // A later native input event can change the original's trailing newline.
  await input('contentImport.raw', `${source}\n`);
  mockSave.mockRejectedValueOnce(new Error('Synthetic network failure'));
  await tap('contentImport.publish');
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
    unresolved: [], paragraphs: [
      expect.objectContaining({ kind: 'introduction', translation_en: 'Introduction sample', translation_de: 'German introduction sample' }),
      expect.objectContaining({ kind: 'text', transliteration: 'latin sample' }),
      expect.objectContaining({ kind: 'note', translation_en: 'Closing sample', translation_de: 'German closing sample' }),
    ],
  }), true);
  await tap('contentImport.publish');
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(mockSave.mock.calls[1][0]).toEqual(mockSave.mock.calls[0][0]);
  expect(alertSpy).not.toHaveBeenCalled();
});

it('does not restore deleted sections automatically when saving', async () => {
  await startNew();
  await tap('contentImport.edit');
  await tap('contentImport.remove');
  await tap('contentImport.saveDraft');
  expect(mockSave).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })
    .some((node) => node.props.children === 'contentImport.validation.previewMissing')).toBe(true);
});

it('preserves a title with parentheses and a period and clears a corrected title error', async () => {
  await startNew();
  await input('contentImport.name', '.');
  await tap('contentImport.saveDraft');
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })
    .some((node) => node.props.children === 'contentImport.validation.title')).toBe(true);
  const title = 'Salawat für Imam Hadi al Naqi (as.)';
  await input('contentImport.name', title);
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);
  mockSave.mockImplementation(async (draft) => ({ id: draft.id, title: draft.title, slug: draft.slug,
    is_published: false, updated_at: '2026-11-13T12:00:00Z' } as Awaited<ReturnType<typeof saveReaderDraft>>));
  await tap('contentImport.saveDraft');
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ title, slug: 'salawat-fur-imam-hadi-al-naqi-as' }), false);
});

it('identifies a missing place instead of blaming a valid title or selected city', async () => {
  await startNew();
  await togglePlace();
  await tap('contentImport.saveDraft');
  expect(mockSave).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })
    .some((node) => node.props.children === 'contentImport.validation.place')).toBe(true);
  await togglePlace();
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);
});

it.each([false, true])('creates the first preview automatically when saving (publish: %s)', async (publish) => {
  await startNew(false);
  await tap(publish ? 'contentImport.publish' : 'contentImport.saveDraft');
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
    rawText: 'نص تجريبي\nlatin sample\nEnglish sample', parsedRaw: 'نص تجريبي\nlatin sample\nEnglish sample',
    paragraphs: [expect.objectContaining({ arabic: 'نص تجريبي', transliteration: 'latin sample', translation_en: 'English sample' })],
  }), publish);
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);
});

it('opens an empty new form after saving and gives the next text a separate identity', async () => {
  await startNew(false);
  await input('contentImport.sourceUrl', 'https://example.invalid/source');
  await tap('contentImport.saveDraft');
  for (const label of ['contentImport.name', 'contentImport.sourceUrl', 'contentImport.raw']) {
    expect(renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label)!.props.value).toBe('');
  }
  expect(renderer.root.findAllByProps({ accessibilityRole: 'checkbox', accessibilityLabel: 'Schrein von Imam Hussain' })[0].props.accessibilityState.checked).toBe(false);
  expect(renderer.root.findAllByProps({ accessibilityLiveRegion: 'polite' }).some((node) => node.props.children === 'contentImport.saved')).toBe(true);
  await input('contentImport.name', 'Next text');
  await togglePlace();
  await input('contentImport.raw', 'نص تجريبي\nnext sample\nNext English sample');
  await tap('contentImport.saveDraft');
  const first = mockSave.mock.calls[0][0];
  const next = mockSave.mock.calls[1][0];
  expect(next.id).not.toBe(first.id);
  expect(next).toEqual(expect.objectContaining({ title: 'Next text', slug: 'next-text', sourceUrl: '', updatedAt: null, wasPublished: false }));
});

it('collapses original and preview separately, preserves edits and saves while collapsed', async () => {
  await startNew();
  await tap('contentImport.edit');
  await input('contentImport.de', 'Edited German translation');
  await tap('contentImport.collapseRaw');
  await tap('contentImport.collapsePreview');
  expect(renderer.root.findAllByType(TextInput).some((node) => ['contentImport.raw', 'contentImport.de'].includes(node.props.accessibilityLabel))).toBe(false);
  expect(button('contentImport.expandRaw').props.accessibilityState.expanded).toBe(false);
  await tap('contentImport.expandRaw');
  await tap('contentImport.expandPreview');
  expect(renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'contentImport.raw')!.props.value).toBe('نص تجريبي\nlatin sample\nEnglish sample');
  expect(renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'contentImport.de')!.props.value).toBe('Edited German translation');
  await tap('contentImport.collapseRaw');
  await tap('contentImport.collapsePreview');
  await tap('contentImport.saveDraft');
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
    paragraphs: [expect.objectContaining({ translation_de: 'Edited German translation' })],
  }), false);
});

it('keeps ambiguous automatic imports visible for correction before publishing', async () => {
  await startNew(false);
  await input('contentImport.raw', 'Unassigned sample');
  await tap('contentImport.collapsePreview');
  await tap('contentImport.publish');
  expect(mockSave).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })
    .some((node) => node.props.children === 'contentImport.reviewNeeded')).toBe(true);
  expect(button('contentImport.resolve')).toBeDefined();
  expect(button('contentImport.publish').props.disabled).toBe(false);
  expect(renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'contentImport.raw')!.props.value).toBe('Unassigned sample');
  await tap('contentImport.publish');
  expect(mockSave).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
  await tap('contentImport.resolve');
  await tap('contentImport.publish');
  expect(mockSave).toHaveBeenCalledTimes(1);
});

it('keeps the edited text after a failed save and permits a retry', async () => {
  await startNew(false); mockSave.mockRejectedValueOnce(new Error('Synthetic network failure'));
  await tap('contentImport.saveDraft');
  expect(renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'contentImport.name')!.props.value).toBe('A complete title');
  expect(button('contentImport.saveDraft').props.disabled).toBe(false);
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'contentImport.raw')!.props.value).toBe('نص تجريبي\nlatin sample\nEnglish sample');
  await tap('contentImport.saveDraft');
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(mockSave.mock.calls[1][0]).toEqual(mockSave.mock.calls[0][0]);
});

it('does not replace preview edits without an explicit choice', async () => {
  await startNew(); await tap('contentImport.addIntro');
  await tap('contentImport.reimport');
  expect(alertSpy).toHaveBeenCalledWith('contentImport.replaceTitle', 'contentImport.replaceBody', expect.any(Array));
  expect(renderer.root.findAllByType(TextInput).some((node) => node.props.accessibilityLabel === 'contentImport.de')).toBe(true);
  await act(async () => {
    await jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find((action) => action.text === 'contentImport.replace')?.onPress?.();
  });
  await tap('contentImport.publish');
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
    paragraphs: [expect.objectContaining({ kind: 'text', translation_en: 'English sample', translation_de: '' })],
  }), true);
});

it('preserves hidden source metadata and legacy originals while editing German in a section', async () => {
  const draft = { ...newReaderDraft(), id: 'saved-text', title: 'Saved text', sourceTitle: 'Source', notes: 'Saved source note', rawGerman: 'Legacy German original', placeIds: ['place-imam-hussain'],
    rawText: 'Original preserved', parsedRaw: 'Original preserved', paragraphs: [{ kind: 'note' as const, arabic: '', transliteration: '', translation_de: 'Saved note', translation_en: 'Saved English note' }],
    updatedAt: '2026-11-13T12:00:00Z', wasPublished: false };
  mockList.mockResolvedValue([{ id: draft.id, title: draft.title }]); mockRead.mockResolvedValue(draft);
  await act(async () => { renderer = create(<AdminContentImportPanel />); });
  await tap('contentImport.edit');
  expect(renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'contentImport.raw')!.props.value).toBe('Original preserved');
  await tap('contentImport.edit');
  expect(renderer.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'contentImport.en')!.props.value).toBe('Saved English note');
  await input('contentImport.de', 'Edited German note');
  mockSave.mockImplementation(async (entry) => ({ id: entry.id, title: entry.title, slug: entry.slug,
    is_published: false, updated_at: '2026-11-13T13:00:00Z' } as Awaited<ReturnType<typeof saveReaderDraft>>));
  await tap('contentImport.saveDraft');
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
    sourceTitle: 'Source', notes: 'Saved source note', rawGerman: 'Legacy German original',
    paragraphs: [expect.objectContaining({ translation_de: 'Edited German note', translation_en: 'Saved English note' })],
  }), false);

});
