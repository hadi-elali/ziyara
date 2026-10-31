import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, type ButtonProps } from '@/components/ui/button';
import type { AppRole, EmergencySendRestriction } from '@/domain/database';
import { AdminEmergencySendRestriction } from './AdminEmergencySendRestriction';

type Result = { data: EmergencySendRestriction[] | null; error: { message: string } | null };
let mockRole: AppRole = 'admin';
const mockRead = jest.fn<() => Promise<Result>>();
const mockWrite = jest.fn<(name: string, args: unknown) => Promise<Result>>();
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ profile: { role: mockRole } }) }));
jest.mock('@/features/auth/supabase', () => ({ supabase: { rpc: (name: string, args: unknown) =>
  name === 'admin_get_emergency_send_restriction' ? { abortSignal: () => mockRead() } : mockWrite(name, args),
} }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ language: 'de', t: (key: string) => key }) }));
jest.mock('@/constants/theme', () => ({ Spacing: { one: 4, two: 8 } }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#175', border: '#888' }) }));
jest.mock('@/components/themed-text', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ThemedText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText> };
});
jest.mock('@/components/ui/button', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Button: ({ disabled, label, onPress }: ButtonProps) =>
    <MockPressable disabled={disabled} onPress={onPress}><MockText>{label}</MockText></MockPressable> };
});

const restriction: EmergencySendRestriction = {
  id: 7, restricted_until: '2099-10-30T12:00:00Z', reason: 'Repeated misuse',
  created_at: '2099-10-30T11:00:00Z', created_by_display_name: 'Test Admin',
};
let renderer: ReactTestRenderer | null;
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
function root() { if (!renderer) throw new Error('Not mounted'); return renderer.root; }
function button(label: string) { return root().findAllByType(Button).find(node => node.props.label === `emergency.restriction.${label}`)!; }
function hasText(text: string) { return root().findAllByType(Text).some(node => node.props.children === text); }
async function flush() { await act(async () => { jest.advanceTimersByTime(0); }); }
async function render(requestId?: number, defaultOpen = true) {
  await act(async () => { renderer = create(requestId
    ? <AdminEmergencySendRestriction requestId={requestId} defaultOpen={defaultOpen} />
    : <AdminEmergencySendRestriction userId="target-user" defaultOpen={defaultOpen} />); });
  await flush();
}
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }
async function reason(text = 'Repeated misuse') {
  await act(async () => root().findByType(TextInput).props.onChangeText(text));
}

describe('admin emergency send restrictions', () => {
  beforeAll(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  });
  beforeEach(() => {
    jest.useFakeTimers();
    renderer = null;
    mockRole = 'admin';
    mockRead.mockReset().mockResolvedValue({ data: [], error: null });
    mockWrite.mockReset().mockResolvedValue({ data: [restriction], error: null });
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    jest.useRealTimers();
  });
  afterAll(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
    if (originalAppState) Object.defineProperty(AppState, 'currentState', originalAppState);
  });

  it.each(['user', 'medical_staff', 'organization_team', 'scholar'] satisfies AppRole[])(
    'hides moderation from %s without querying it', async role => {
      mockRole = role;
      await render();
      expect(root().findAllByType(Button)).toHaveLength(0);
      expect(mockRead).not.toHaveBeenCalled();
    },
  );

  it('loads request moderation only when expanded', async () => {
    await render(42, false);
    expect(mockRead).not.toHaveBeenCalled();
    await press('manage');
    await flush();
    expect(mockRead).toHaveBeenCalledTimes(1);
    await reason();
    await press('restrict');
    expect(mockWrite).toHaveBeenCalledWith('admin_restrict_emergency_sender', {
      p_request_id: 42, p_duration_hours: 1, p_reason: 'Repeated misuse',
    });
  });

  it('requires a reason and sends a selected finite duration for the user', async () => {
    await render();
    await press('restrict');
    expect(mockWrite).not.toHaveBeenCalled();
    expect(hasText('emergency.restriction.validation')).toBe(true);
    await reason('  Repeated misuse  ');
    await press('hours24');
    mockRead.mockResolvedValue({ data: [restriction], error: null });
    await press('restrict');
    expect(mockWrite).toHaveBeenCalledWith('admin_restrict_emergency_sender', {
      p_user_id: 'target-user', p_duration_hours: 24, p_reason: 'Repeated misuse',
    });
    expect(hasText('emergency.restriction.saved')).toBe(true);
    expect(hasText(restriction.reason)).toBe(true);
  });

  it('revokes only the displayed restriction and confirms the refreshed status', async () => {
    mockRead.mockResolvedValueOnce({ data: [restriction], error: null });
    await render();
    expect(button('restrict')).toBeUndefined();
    await press('revoke');
    expect(mockWrite).toHaveBeenCalledWith('admin_revoke_emergency_send_restriction', {
      p_user_id: 'target-user', p_restriction_id: 7,
    });
    expect(hasText('emergency.restriction.revoked')).toBe(true);
    expect(hasText('emergency.restriction.inactive')).toBe(true);
  });

  it('saves a restriction until manual release and displays it without formatting an expiry', async () => {
    const manualRestriction = { ...restriction, restricted_until: 'infinity' };
    await render();
    await reason();
    await press('untilRelease');
    mockWrite.mockResolvedValueOnce({ data: [manualRestriction], error: null });
    mockRead.mockResolvedValue({ data: [manualRestriction], error: null });
    await press('restrict');
    expect(mockWrite).toHaveBeenCalledWith('admin_restrict_emergency_sender', {
      p_user_id: 'target-user', p_duration_hours: null, p_reason: 'Repeated misuse',
    });
    expect(hasText('emergency.restriction.activeUntilRelease')).toBe(true);
    expect(button('revoke')).toBeDefined();
  });

  it('loads and manually lifts a persisted restriction without an expiry', async () => {
    mockRead.mockResolvedValueOnce({ data: [{ ...restriction, restricted_until: 'infinity' }], error: null });
    await render();
    expect(hasText('emergency.restriction.activeUntilRelease')).toBe(true);
    await press('revoke');
    expect(mockWrite).toHaveBeenCalledWith('admin_revoke_emergency_send_restriction', {
      p_user_id: 'target-user', p_restriction_id: 7,
    });
    expect(hasText('emergency.restriction.inactive')).toBe(true);
  });

  it('fails closed for administrative mutations when the status cannot be read and supports retry', async () => {
    mockRead.mockResolvedValueOnce({ data: null, error: { message: 'Unavailable' } });
    await render();
    expect(hasText('emergency.restriction.loadError')).toBe(true);
    expect(button('restrict')).toBeUndefined();
    await act(async () => root().findAllByType(Button).find(node => node.props.label === 'emergency.retry')!.props.onPress());
    expect(button('restrict')).toBeDefined();
  });

  it('prevents double mutations and locks controls while the write is pending', async () => {
    let resolve!: (result: Result) => void;
    mockWrite.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await render();
    await reason();
    const onPress = button('restrict').props.onPress;
    await act(async () => { onPress(); onPress(); });
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(button('restrict').props.disabled).toBe(true);
    expect(root().findByType(TextInput).props.editable).toBe(false);
    await act(async () => resolve({ data: [restriction], error: null }));
  });

  it('keeps the reason after a failed mutation and reconciles the server status', async () => {
    mockWrite.mockResolvedValueOnce({ data: null, error: { message: 'Denied' } });
    await render();
    await reason();
    await press('restrict');
    expect(hasText('emergency.restriction.error')).toBe(true);
    expect(root().findByType(TextInput).props.value).toBe('Repeated misuse');
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(button('restrict').props.disabled).toBe(false);
  });

  it('refreshes to show restrictions made by other admins and automatic expiry', async () => {
    await render();
    mockRead.mockResolvedValueOnce({ data: [restriction], error: null });
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(button('revoke')).toBeDefined();
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(button('restrict')).toBeDefined();
  });
});
