import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import EmergencyScreen from '@/app/emergency';
import { Button, type ButtonProps } from '@/components/ui/button';
import { emergencyRestrictionUntil, isEmergencySendRestrictedError } from './use-emergency-send-restriction';

type RestrictionResult = { data: string | null; error: { message: string } | null };
type SubmitResult = {
  data: { request_id: number; recipient_count: number }[] | null;
  error: { message: string; details?: string } | null;
};
const mockRestriction = jest.fn<() => Promise<RestrictionResult>>();
const mockSubmit = jest.fn<(args: unknown) => Promise<SubmitResult>>();
const mockDispatch = jest.fn<() => Promise<{ data: { accepted: number }; error: null }>>();
jest.mock('expo-location', () => ({}));
jest.mock('@/features/auth/RequireAuth', () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({
  profile: { id: 2, role: 'user' }, session: { user: { id: 'sender' } },
}) }));
jest.mock('@/features/auth/supabase', () => ({ supabase: {
  rpc: (name: string, args: unknown) => {
    if (name === 'submit_emergency_request') return mockSubmit(args);
    return { abortSignal: () => name === 'get_my_emergency_send_restriction'
      ? mockRestriction() : Promise.resolve({ data: [], error: null }) };
  },
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({
    abortSignal: () => Promise.resolve({ data: [], error: null }),
  }) }) }) }) }),
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: () => Promise.resolve(),
  functions: { invoke: () => mockDispatch() },
} }));
jest.mock('@/features/general-alarm/general-alarm-notifications-context', () => ({ useGeneralAlarmNotifications: () => ({}) }));
jest.mock('@/features/emergency/EmergencyRequestActions', () => ({ EmergencyRequestActions: () => null, EmergencyRequestStatus: () => null }));
jest.mock('@/features/places/openNavigation', () => ({ openNavigation: jest.fn() }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ language: 'de', t: (key: string) => key }) }));
jest.mock('@/constants/theme', () => ({ Spacing: { one: 4, two: 8, three: 16 } }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#175', border: '#888' }) }));
jest.mock('@/components/themed-text', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ThemedText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText> };
});
jest.mock('@/components/ui/screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/ui/section', () => ({ Section: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/ui/card', () => ({ Card: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/ui/button', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Button: ({ disabled, label, onPress }: ButtonProps) =>
    <MockPressable disabled={disabled} onPress={onPress}><MockText>{label}</MockText></MockPressable> };
});

const until = '2026-10-30T12:00:00.000Z';
const rejected = { message: 'EMERGENCY_SEND_RESTRICTED', details: JSON.stringify({ restricted_until: until }) };
let renderer: ReactTestRenderer | null;
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
function root() { if (!renderer) throw new Error('Not mounted'); return renderer.root; }
function submitButton() { return root().findAllByType(Button).find(node => node.props.label === 'emergency.submit')!; }
function hasText(text: string) { return root().findAllByType(Text).some(node => node.props.children === text); }
async function render() {
  await act(async () => { renderer = create(<EmergencyScreen />); });
  await act(async () => { jest.advanceTimersByTime(0); });
}
async function fill() {
  await act(async () => {
    root().findAll(node => node.props.accessibilityRole === 'button' &&
      node.props.accessibilityState?.selected === false && typeof node.props.onPress === 'function')[0].props.onPress();
    root().findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'emergency.locationLabel')!
      .props.onChangeText('Hotel lobby');
    root().findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'emergency.messageLabel')!
      .props.onChangeText('I need help');
  });
}

describe('emergency sending with moderation', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-30T11:00:00.000Z'));
    renderer = null;
    mockRestriction.mockReset().mockResolvedValue({ data: null, error: null });
    mockSubmit.mockReset().mockResolvedValue({ data: [{ request_id: 42, recipient_count: 1 }], error: null });
    mockDispatch.mockReset().mockResolvedValue({ data: { accepted: 1 }, error: null });
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); jest.useRealTimers(); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('shows the expiry and direct contact notice and disables sending for a known restriction', async () => {
    mockRestriction.mockResolvedValue({ data: until, error: null });
    await render();
    expect(hasText('emergency.restriction.senderUntil')).toBe(true);
    expect(hasText('emergency.restriction.senderContact')).toBe(true);
    expect(submitButton().props.disabled).toBe(true);
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('handles a restriction imposed during editing without push or a success message and retains the draft', async () => {
    await render();
    await fill();
    mockSubmit.mockResolvedValueOnce({ data: null, error: rejected });
    mockRestriction.mockResolvedValue({ data: until, error: null });
    await act(async () => { await submitButton().props.onPress(); });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(hasText('emergency.restriction.senderRejected')).toBe(true);
    expect(hasText('emergency.feedback.success')).toBe(false);
    expect(submitButton().props.disabled).toBe(true);
    expect(root().findAllByType(TextInput).some(node => node.props.value === 'I need help')).toBe(true);
  });

  it('keeps an indefinite restriction active until an admin releases it', async () => {
    mockRestriction.mockResolvedValue({ data: 'infinity', error: null });
    await render();
    expect(hasText('emergency.restriction.senderUntilRelease')).toBe(true);
    expect(submitButton().props.disabled).toBe(true);
    await act(async () => { jest.advanceTimersByTime(86_400_000); });
    expect(submitButton().props.disabled).toBe(true);
    mockRestriction.mockResolvedValue({ data: null, error: null });
    await act(async () => root().findAllByType(Button).find(node => node.props.label === 'emergency.retry')!.props.onPress());
    expect(hasText('emergency.restriction.senderUntilRelease')).toBe(false);
    expect(submitButton().props.disabled).toBe(false);
  });

  it('handles an indefinite rejection during editing without sending push, including a failed status refresh', async () => {
    await render();
    await fill();
    mockSubmit.mockResolvedValueOnce({ data: null, error: {
      message: rejected.message, details: '{"restricted_until":"infinity"}',
    } });
    mockRestriction.mockRejectedValue(new Error('Offline'));
    await act(async () => { await submitButton().props.onPress(); });
    expect(hasText('emergency.restriction.senderUntilRelease')).toBe(true);
    expect(hasText('emergency.restriction.senderRejected')).toBe(true);
    expect(submitButton().props.disabled).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('still explains rejection if the server detail is malformed and refreshing fails', async () => {
    await render();
    await fill();
    mockSubmit.mockResolvedValueOnce({ data: null, error: { message: 'EMERGENCY_SEND_RESTRICTED', details: 'invalid' } });
    mockRestriction.mockRejectedValue(new Error('Offline'));
    await act(async () => { await submitButton().props.onPress(); });
    expect(hasText('emergency.restriction.senderRejected')).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('does not prevent genuine requests when the advisory status read fails', async () => {
    mockRestriction.mockRejectedValue(new Error('Offline'));
    await render();
    await fill();
    expect(submitButton().props.disabled).toBe(false);
    await act(async () => { await submitButton().props.onPress(); });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(hasText('emergency.feedback.success')).toBe(true);
  });

  it('re-enables sending after revocation is refreshed', async () => {
    mockRestriction.mockResolvedValueOnce({ data: until, error: null });
    await render();
    expect(submitButton().props.disabled).toBe(true);
    await act(async () => root().findAllByType(Button).find(node => node.props.label === 'emergency.retry')!.props.onPress());
    expect(submitButton().props.disabled).toBe(false);
    expect(hasText('emergency.restriction.senderUntil')).toBe(false);
  });

  it('re-enables sending when the finite restriction expires', async () => {
    mockRestriction.mockResolvedValueOnce({ data: '2026-10-30T11:00:01.000Z', error: null });
    await render();
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(submitButton().props.disabled).toBe(false);
  });

  it('accepts only the structured restriction error and a valid expiry', () => {
    expect(isEmergencySendRestrictedError(rejected)).toBe(true);
    expect(emergencyRestrictionUntil(rejected)).toBe(until);
    expect(emergencyRestrictionUntil({ message: rejected.message, details: '{"restricted_until":"infinity"}' })).toBe('infinity');
    expect(emergencyRestrictionUntil({ message: 'Other error', details: rejected.details })).toBeNull();
    expect(emergencyRestrictionUntil({ message: rejected.message, details: '{"restricted_until":"bad"}' })).toBeNull();
    expect(emergencyRestrictionUntil(null)).toBeNull();
  });
});
