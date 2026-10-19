import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, Platform, Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, type ButtonProps } from '@/components/ui/button';
import type { AppRole, EmergencyInboxMessage } from '@/domain/database';
import { EmergencyRequestActions } from '@/features/emergency/EmergencyRequestActions';

let mockRole: AppRole = 'medical_staff';
const completedAt = '2026-10-19T10:00:00.000Z';
const mockRpc = jest.fn<(
  name: string,
  args: { p_request_id: number },
) => Promise<{ data: string | null; error: { message: string } | null }>>();

jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ profile: { role: mockRole } }) }));
jest.mock('@/features/auth/supabase', () => ({
  supabase: { rpc: (name: string, args: { p_request_id: number }) => mockRpc(name, args) },
}));
jest.mock('@/features/i18n/i18n', () => ({
  useI18n: () => ({ language: 'de', t: (key: string) => key }),
}));
jest.mock('@/constants/theme', () => ({ Spacing: { two: 8 } }));
jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ border: '#cad7d0', success: '#2a7a43', warning: '#a9792b', textSecondary: '#5b6861', accentSoft: '#ddefe7' }),
}));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));
jest.mock('@/components/themed-text', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ThemedText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText> };
});
jest.mock('@/components/ui/button', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Button: ({ disabled, label, onPress }: ButtonProps) => (
      <MockPressable disabled={disabled} onPress={onPress}><MockText>{label}</MockText></MockPressable>
    ),
  };
});

const item: Pick<EmergencyInboxMessage, 'request_id' | 'target_team' | 'completed_at'> = {
  request_id: 42, target_team: 'medical', completed_at: null,
};
const onChanged = jest.fn();
let renderer: ReactTestRenderer | null;
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

function root() {
  if (!renderer) throw new Error('Component not mounted');
  return renderer.root;
}
function button(label: string) {
  return root().findAllByType(Button).find((node) => node.props.label === label);
}
async function render(overrides: Partial<typeof item> = {}, showActions = true) {
  await act(async () => {
    renderer = create(<EmergencyRequestActions item={{ ...item, ...overrides }} onChanged={showActions ? onChanged : undefined} />);
  });
}

describe('EmergencyRequestActions', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    renderer = null;
    mockRole = 'medical_staff';
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: completedAt, error: null });
  });
  afterEach(async () => {
    if (renderer) await act(async () => renderer?.unmount());
    jest.restoreAllMocks();
    if (originalWindowDescriptor) Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment; });

  it.each([
    ['medical_staff', 'medical', true, false],
    ['medical_staff', 'travel', false, false],
    ['organization_team', 'travel', true, false],
    ['organization_team', 'medical', false, false],
    ['admin', 'medical', true, true],
    ['admin', 'travel', true, true],
    ['user', 'medical', false, false],
    ['scholar', 'medical', false, false],
  ] satisfies [AppRole, EmergencyInboxMessage['target_team'], boolean, boolean][])('limits actions for %s on %s', async (role, team, complete, remove) => {
    mockRole = role;
    await render({ target_team: team });
    expect(Boolean(button('emergency.complete'))).toBe(complete);
    expect(Boolean(button('emergency.delete'))).toBe(remove);
  });

  it('shows completion for senders without management actions', async () => {
    mockRole = 'admin';
    await render({ completed_at: completedAt }, false);
    expect(root().findAllByType(Pressable)).toHaveLength(0);
    expect(root().findAllByType(Text).some((node) => node.props.children === 'emergency.completed')).toBe(true);
  });

  it('keeps completed cases visible and permits only admin deletion', async () => {
    mockRole = 'admin';
    await render({ completed_at: completedAt });
    expect(button('emergency.complete')).toBeUndefined();
    expect(button('emergency.delete')).toBeDefined();
  });

  it('persists completion and reports the server timestamp', async () => {
    await render();
    await act(async () => button('emergency.complete')?.props.onPress());
    expect(mockRpc).toHaveBeenCalledWith('complete_emergency_request', { p_request_id: 42 });
    expect(onChanged).toHaveBeenCalledWith({ requestId: 42, kind: 'completed', completedAt });
  });

  it('disables actions and blocks repeated submissions while completing', async () => {
    let resolveWrite: ((result: { data: string; error: null }) => void) | undefined;
    mockRpc.mockImplementationOnce(() => new Promise((resolve) => { resolveWrite = resolve; }));
    await render();
    const onPress = button('emergency.complete')?.props.onPress;
    await act(async () => { onPress(); onPress(); });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(button('emergency.completing')?.props.disabled).toBe(true);
    await act(async () => resolveWrite?.({ data: completedAt, error: null }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('retains the case and exposes a retry after a failed write', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Permission denied by server' } });
    await render();
    await act(async () => button('emergency.complete')?.props.onPress());
    expect(onChanged).not.toHaveBeenCalled();
    expect(button('emergency.complete')?.props.disabled).toBe(false);
    expect(root().findAllByType(Text).some((node) => node.props.children === 'Permission denied by server')).toBe(true);
    await act(async () => button('emergency.complete')?.props.onPress());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('requires native confirmation and keeps cancellation harmless', async () => {
    mockRole = 'admin';
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render();
    await act(async () => button('emergency.delete')?.props.onPress());
    expect(mockRpc).not.toHaveBeenCalled();
    const choices = alert.mock.calls[0]?.[2];
    expect(choices?.find((choice) => choice.style === 'cancel')).toBeDefined();
    await act(async () => choices?.find((choice) => choice.style === 'destructive')?.onPress?.());
    expect(mockRpc).toHaveBeenCalledWith('admin_delete_emergency_request', { p_request_id: 42 });
    expect(onChanged).toHaveBeenCalledWith({ requestId: 42, kind: 'deleted' });
  });

  it('honors web cancellation and explicit confirmation', async () => {
    mockRole = 'admin';
    jest.replaceProperty(Platform, 'OS', 'web');
    const confirm = jest.fn<() => boolean>().mockReturnValueOnce(false).mockReturnValueOnce(true);
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm } });
    await render();
    await act(async () => button('emergency.delete')?.props.onPress());
    expect(mockRpc).not.toHaveBeenCalled();
    await act(async () => button('emergency.delete')?.props.onPress());
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith({ requestId: 42, kind: 'deleted' });
  });

  it('keeps a failed deletion visible', async () => {
    mockRole = 'admin';
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Delete failed' } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render();
    await act(async () => button('emergency.delete')?.props.onPress());
    await act(async () => alert.mock.calls[0]?.[2]?.find((choice) => choice.style === 'destructive')?.onPress?.());
    expect(onChanged).not.toHaveBeenCalled();
    expect(button('emergency.delete')?.props.disabled).toBe(false);
  });
});
