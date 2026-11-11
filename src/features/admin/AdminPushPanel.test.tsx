import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { ActivityIndicator, AppState, TextInput, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, type ButtonProps } from '@/components/ui/button';
import type { AdminPushMessageSummary, AppRole } from '@/domain/database';
import { SupabaseReadTimeoutError } from '@/features/network/supabase-read';
import { AdminPushPanel } from './AdminPushPanel';

const mockAuth = { profile: { role: 'admin' as AppRole }, session: { user: { id: 'admin-1' } } };
const mockPrepare = jest.fn<(args: unknown) => Promise<{ data: number | null; error: { message: string } | null }>>();
type HistoryResult = { data: AdminPushMessageSummary[] | null; error: { message: string } | null };
const mockList = jest.fn<(name: string, signal: AbortSignal) => Promise<HistoryResult>>();
const mockInvoke = jest.fn<(...args: unknown[]) => Promise<{ data: { code: string } | null; error: { message: string } | null }>>();
const mockT = (key: string) => key;
jest.mock('@/constants/theme', () => ({ Spacing: { two: 8, three: 12 } }));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/auth/supabase', () => ({ supabase: {
  rpc: (name: string, args: unknown) => name === 'admin_prepare_push_message'
    ? mockPrepare(args) : { abortSignal: (signal: AbortSignal) => mockList(name, signal) },
  functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
} }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ t: mockT, language: 'de', isRTL: false }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#125', text: '#111', textSecondary: '#666', border: '#888', backgroundElement: '#fff' }) }));
jest.mock('@/components/themed-text', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ThemedText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText> };
});
jest.mock('@/components/ui/card', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView> };
});
jest.mock('@/components/ui/button', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Button: ({ disabled, onPress, label }: ButtonProps) => <MockPressable disabled={disabled} onPress={onPress}><MockText>{label}</MockText></MockPressable> };
});

const draft = {
  id: 42, title: 'Treffpunkt', body: 'Bitte zur Rezeption kommen.',
};
const savedMessage: AdminPushMessageSummary = {
  ...draft, created_at: '2026-11-10T12:30:00Z', started_at: '2026-11-10T12:31:00Z',
  total: 4, accepted: 3, failed: 1, pending: 0,
};
let renderer: ReactTestRenderer | null;
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
function button(label: string) {
  const labels = label === 'send' ? ['send', 'sendBrothers', 'sendSisters'] : [label];
  return renderer!.root.findAllByType(Button).find(node => labels.some(value => node.props.label === `adminPush.${value}`))!;
}
function audienceChoice(value: string) {
  return renderer!.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === `adminPush.${value}` && typeof node.props.onPress === 'function')[0];
}
function hasText(text: string) { return renderer!.root.findAllByType(Text).some(node => node.props.children === text); }
async function render() {
  await act(async () => { renderer = create(<AdminPushPanel />); });
}
async function compose() {
  await act(async () => {
    const inputs = renderer!.root.findAllByType(TextInput);
    inputs[0].props.onChangeText('  Treffpunkt  ');
    inputs[1].props.onChangeText('  Bitte zur Rezeption kommen.  ');
  });
}

describe('AdminPushPanel', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.clearAllMocks(); mockPrepare.mockReset(); mockInvoke.mockReset(); mockList.mockReset(); renderer = null;
    mockAuth.profile.role = 'admin'; mockAuth.session.user.id = 'admin-1';
    mockPrepare.mockResolvedValue({ data: 42, error: null });
    mockInvoke.mockResolvedValue({ data: { code: 'processed' }, error: null });
    mockList.mockResolvedValue({ data: [], error: null });
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('loads the saved history and requires nonblank input', async () => {
    await render();
    expect(hasText('adminPush.history')).toBe(true);
    expect(hasText('adminPush.historyEmpty')).toBe(true);
    expect(mockList).toHaveBeenCalledWith('admin_list_push_messages', expect.any(AbortSignal));
    expect(button('send').props.disabled).toBe(true);
    await act(async () => { await button('send').props.onPress(); });
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(hasText('adminPush.validation')).toBe(true);
  });

  it('saves trimmed input and dispatches directly with a single tap', async () => {
    await render(); await compose();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(hasText('adminPush.preview')).toBe(false);
    expect(renderer!.root.findAllByType(Button)).toHaveLength(2);
    await act(async () => { await button('send').props.onPress(); });
    expect(mockPrepare).toHaveBeenCalledWith({ p_title: draft.title, p_body: draft.body, p_audience: 'all' });
    expect(mockInvoke).toHaveBeenCalledWith('dispatch-admin-push', { body: { messageId: 42 } });
    expect(hasText('adminPush.processed')).toBe(true);
    expect(button('send').props.disabled).toBe(true);
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('shows persisted titles and complete text again after reopening the panel', async () => {
    mockList.mockResolvedValue({ data: [savedMessage], error: null });
    await render();
    expect(hasText(savedMessage.title)).toBe(true);
    expect(hasText(savedMessage.body)).toBe(true);
    expect(hasText('adminPush.processed')).toBe(true);
    expect(hasText('adminPush.historyCounts')).toBe(true);
    expect(hasText('adminPush.historyDeliveryHint')).toBe(true);
    await act(async () => { renderer!.unmount(); });
    await render();
    expect(hasText(savedMessage.body)).toBe(true);
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it.each([
    [{ started_at: null, total: 0, accepted: 0, failed: 0, pending: 0 }, 'historySaved'],
    [{ total: 0, accepted: 0, failed: 0, pending: 0 }, 'historyNoDevices'],
    [{ accepted: 2, pending: 1 }, 'historyPending'],
  ])('distinguishes saved, empty-recipient and unconfirmed sends: %s', async (changes, status) => {
    mockList.mockResolvedValue({ data: [{ ...savedMessage, ...changes }], error: null });
    await render();
    expect(hasText(`adminPush.${status}`)).toBe(true);
  });

  it('shows loading until the history arrives', async () => {
    let resolve: ((result: HistoryResult) => void) | undefined;
    mockList.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await render();
    expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(button('historyRefresh').props.disabled).toBe(true);
    expect(hasText('adminPush.historyEmpty')).toBe(false);
    await act(async () => { resolve?.({ data: [savedMessage], error: null }); });
    expect(hasText(savedMessage.body)).toBe(true);
    expect(button('historyRefresh').props.disabled).toBe(false);
  });

  it.each([
    [{ message: 'Network request failed' }, 'offline'],
    [new SupabaseReadTimeoutError(10_000), 'timeout'],
    [{ message: 'Server error' }, 'server'],
  ])('recovers from history failures without blocking the composer: %s', async (error, kind) => {
    mockList.mockResolvedValueOnce({ data: null, error });
    await render();
    expect(hasText(`adminPush.historyError.${kind}`)).toBe(true);
    expect(hasText('adminPush.historyEmpty')).toBe(false);
    mockList.mockResolvedValueOnce({ data: [savedMessage], error: null });
    await act(async () => { button('historyRefresh').props.onPress(); });
    expect(hasText(savedMessage.body)).toBe(true);
    expect(hasText(`adminPush.historyError.${kind}`)).toBe(false);
    await compose();
    await act(async () => { button('send').props.onPress(); });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('keeps loaded messages when refreshing the history fails', async () => {
    mockList.mockResolvedValueOnce({ data: [savedMessage], error: null });
    await render();
    mockList.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    await act(async () => { button('historyRefresh').props.onPress(); });
    expect(hasText(savedMessage.body)).toBe(true);
    expect(hasText('adminPush.historyError.offline')).toBe(true);
  });

  it('refreshes saved messages even after an uncertain dispatch', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    await render(); await compose();
    mockList.mockResolvedValueOnce({ data: [{ ...savedMessage, started_at: null }], error: null });
    await act(async () => { button('send').props.onPress(); });
    expect(hasText(savedMessage.body)).toBe(true);
    expect(hasText('adminPush.historySaved')).toBe(true);
    expect(hasText('adminPush.sendError Network request failed')).toBe(true);
  });

  it('ignores an older history response that arrives after sending', async () => {
    let resolve: ((result: HistoryResult) => void) | undefined;
    mockList.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await render(); await compose();
    mockList.mockResolvedValueOnce({ data: [savedMessage], error: null });
    await act(async () => { button('send').props.onPress(); });
    await act(async () => { resolve?.({ data: [], error: null }); });
    expect(hasText(savedMessage.body)).toBe(true);
  });

  it('refreshes history when the app returns to the foreground', async () => {
    await render();
    mockList.mockResolvedValueOnce({ data: [savedMessage], error: null });
    await act(async () => { jest.mocked(AppState.addEventListener).mock.calls.at(-1)![1]('active'); });
    expect(hasText(savedMessage.body)).toBe(true);
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('clears history on account change and ignores the previous account response', async () => {
    let resolve: ((result: HistoryResult) => void) | undefined;
    mockList.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await render();
    mockAuth.session.user.id = 'admin-2';
    await act(async () => { renderer!.update(<AdminPushPanel />); });
    await act(async () => { resolve?.({ data: [savedMessage], error: null }); });
    expect(hasText(savedMessage.body)).toBe(false);
    expect(hasText('adminPush.historyEmpty')).toBe(true);
  });

  it.each(['all', 'brother', 'sister'] as const)('sends directly to the selected %s audience', async audience => {
    await render(); await compose();
    await act(async () => { audienceChoice(audience).props.onPress(); });
    expect(audienceChoice(audience).props.accessibilityState.checked).toBe(true);
    await act(async () => { await button('send').props.onPress(); });
    expect(mockPrepare).toHaveBeenCalledWith({ p_title: draft.title, p_body: draft.body, p_audience: audience });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(audienceChoice(audience).props.accessibilityState.checked).toBe(true);
  });

  it('creates a new message when recipients change after an uncertain send', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    mockPrepare.mockResolvedValueOnce({ data: 42, error: null }).mockResolvedValueOnce({ data: 43, error: null });
    await render(); await compose();
    await act(async () => { await button('send').props.onPress(); });
    await act(async () => { audienceChoice('sister').props.onPress(); });
    await act(async () => { await button('send').props.onPress(); });
    expect(mockPrepare).toHaveBeenCalledTimes(2);
    expect(mockPrepare).toHaveBeenLastCalledWith({ p_title: draft.title, p_body: draft.body, p_audience: 'sister' });
    expect(mockInvoke).toHaveBeenLastCalledWith('dispatch-admin-push', { body: { messageId: 43 } });
  });

  it('retains entered text and does not dispatch if saving fails', async () => {
    mockPrepare.mockResolvedValueOnce({ data: null, error: { message: 'Save failed' } });
    await render(); await compose();
    await act(async () => { audienceChoice('sister').props.onPress(); });
    await act(async () => { await button('send').props.onPress(); });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(hasText('Save failed')).toBe(true);
    expect(renderer!.root.findAllByType(TextInput)[0].props.value).toBe('  Treffpunkt  ');
    expect(button('send').props.disabled).toBe(false);
  });

  it('keeps the same message ID after an ambiguous dispatch failure', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    await render(); await compose();
    await act(async () => { await button('send').props.onPress(); });
    expect(hasText('adminPush.processed')).toBe(false);
    expect(button('send')).toBeDefined();
    await act(async () => { await button('send').props.onPress(); });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'dispatch-admin-push', { body: { messageId: 42 } });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'dispatch-admin-push', { body: { messageId: 42 } });
  });

  it('creates a new saved message after editing a failed send', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    mockPrepare.mockResolvedValueOnce({ data: 42, error: null }).mockResolvedValueOnce({ data: 43, error: null });
    await render(); await compose();
    await act(async () => { await button('send').props.onPress(); });
    await act(async () => { renderer!.root.findAllByType(TextInput)[1].props.onChangeText('Neuer Treffpunkt'); });
    await act(async () => { await button('send').props.onPress(); });
    expect(mockPrepare).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenLastCalledWith('dispatch-admin-push', { body: { messageId: 43 } });
  });

  it('blocks repeated taps while saving before dispatch', async () => {
    let resolve: ((result: { data: number; error: null }) => void) | undefined;
    mockPrepare.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await render(); await compose();
    const send = button('send').props.onPress;
    await act(async () => { send(); send(); });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(button('sending').props.disabled).toBe(true);
    expect(audienceChoice('sister').props.disabled).toBe(true);
    await act(async () => { resolve?.({ data: 42, error: null }); });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('blocks double taps while dispatching', async () => {
    let resolve: ((result: { data: { code: string }; error: null }) => void) | undefined;
    mockInvoke.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await render(); await compose();
    const send = button('send').props.onPress;
    await act(async () => { send(); send(); });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(button('sending').props.disabled).toBe(true);
    expect(audienceChoice('sister').props.disabled).toBe(true);
    await act(async () => { resolve?.({ data: { code: 'processed' }, error: null }); });
  });

  it.each([
    [404, { code: 'NOT_FOUND' }, 'unavailable'],
    [500, { code: 'not_configured' }, 'unavailable'],
    [401, { code: 401, message: 'Invalid JWT' }, 'sessionError'],
    [403, { code: 'admin_required' }, 'accessError'],
    [400, { code: 'invalid_message' }, 'messageError'],
    [500, { code: 'dispatch_failed' }, 'sendError'],
    [502, { message: 'private server details' }, 'sendError'],
  ])('explains HTTP %s without displaying the generic SDK error', async (status, payload, key) => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError({
      status, json: async () => payload,
    }) });
    await render(); await compose();
    await act(async () => { await button('send').props.onPress(); });
    expect(hasText(`adminPush.${key}`)).toBe(true);
    expect(hasText('adminPush.processed')).toBe(false);
    expect(button('send')).toBeDefined();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('recognizes a missing function even when the gateway response is not JSON', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError({
      status: 404, json: async () => { throw new SyntaxError('HTML response'); },
    }) });
    await render(); await compose();
    await act(async () => { await button('send').props.onPress(); });
    expect(hasText('adminPush.unavailable')).toBe(true);
  });

  it.each(['user', 'scholar', 'medical_staff', 'organization_team'] as const)('hides the composer and skips reads for %s', async role => {
    mockAuth.profile.role = role;
    await render();
    expect(mockList).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType(Button)).toHaveLength(0);
  });

  it('discards a late preparation result after switching accounts', async () => {
    let resolve: ((result: { data: number | null; error: { message: string } | null }) => void) | undefined;
    mockPrepare.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await render();
    await act(async () => {
      const inputs = renderer!.root.findAllByType(TextInput);
      inputs[0].props.onChangeText('Treffpunkt'); inputs[1].props.onChangeText('Zur Rezeption');
    });
    await act(async () => { button('send').props.onPress(); });
    mockAuth.session.user.id = 'admin-2';
    await act(async () => { renderer!.update(<AdminPushPanel />); });
    await act(async () => { resolve?.({ data: 42, error: null }); });
    expect(renderer!.root.findAllByType(TextInput)[0].props.value).toBe('');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
