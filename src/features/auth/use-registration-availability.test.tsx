import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { AppState, Switch } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AdminRegistrationPanel } from '@/features/admin/AdminRegistrationPanel';
import { useRegistrationAvailability } from './use-registration-availability';

type Result = { data: boolean | null; error: { message: string } | null };
const mockQuery = jest.fn<() => Promise<Result>>();
const mockSave = jest.fn<() => Promise<Result>>();
const mockRpc = jest.fn((name: string, _args?: unknown) => name === 'get_registration_enabled'
  ? { abortSignal: mockQuery }
  : mockSave());
jest.mock('@/features/auth/supabase', () => ({ supabase: { rpc: (name: string, args?: unknown) => mockRpc(name, args) } }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, isRTL: false }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#267', border: '#888', background: '#fff' }) }));
jest.mock('@/components/themed-text', () => ({ ThemedText: jest.requireActual<typeof import('react-native')>('react-native').Text }));
jest.mock('@/components/ui/card', () => ({ Card: jest.requireActual<typeof import('react-native')>('react-native').View }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));
jest.mock('@/constants/theme', () => ({ Spacing: { three: 12 } }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null;
let value: ReturnType<typeof useRegistrationAvailability>;
let onAppState: (state: 'active') => void;
function Probe() {
  const result = useRegistrationAvailability();
  useEffect(() => { value = result; }, [result]);
  return null;
}
async function mount(admin = false) {
  await act(async () => { renderer = create(admin ? <AdminRegistrationPanel /> : <Probe />); });
}

describe('registration availability and admin control', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ data: true, error: null });
    mockSave.mockResolvedValue({ data: false, error: null });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onAppState = listener;
      return { remove: jest.fn() };
    });
  });
  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = null;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('fails closed on a failed read and recovers when the app returns to the foreground', async () => {
    await mount();
    expect(value.enabled).toBe(true);
    mockQuery.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await act(async () => { await value.refresh(); });
    expect(value.enabled).toBeNull();
    expect(value.hasError).toBe(true);
    mockQuery.mockResolvedValueOnce({ data: false, error: null });
    await act(async () => { onAppState('active'); });
    expect(value.enabled).toBe(false);
    expect(value.hasError).toBe(false);
  });

  it('ignores a stale enabled response after a newer response closed registration', async () => {
    let resolve!: (result: Result) => void;
    mockQuery.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await mount();
    mockQuery.mockResolvedValueOnce({ data: false, error: null });
    await act(async () => { await value.refresh(); });
    await act(async () => { resolve({ data: true, error: null }); });
    expect(value.enabled).toBe(false);
  });

  it('times out an unavailable backend and keeps a retryable state', async () => {
    mockQuery.mockImplementationOnce(() => new Promise(() => {}));
    await mount();
    expect(value.enabled).toBeNull();
    await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });
    expect(value.hasError).toBe(true);
    await act(async () => { await value.refresh(); });
    expect(value.enabled).toBe(true);
  });

  it('saves the admin choice and displays the confirmed server value', async () => {
    await mount(true);
    expect(renderer!.root.findByType(Switch).props.value).toBe(true);
    mockQuery.mockResolvedValueOnce({ data: false, error: null });
    await act(async () => { renderer!.root.findByType(Switch).props.onValueChange(false); });
    expect(mockRpc).toHaveBeenCalledWith('admin_set_registration_enabled', { p_enabled: false });
    expect(renderer!.root.findByType(Switch).props.value).toBe(false);
    expect(renderer!.root.findByType(Switch).props.disabled).toBe(false);
  });

  it('does not present a rejected change as saved and prevents overlapping mutations', async () => {
    let resolve!: (result: Result) => void;
    mockSave.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await mount(true);
    await act(async () => {
      renderer!.root.findByType(Switch).props.onValueChange(false);
      renderer!.root.findByType(Switch).props.onValueChange(false);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByType(Switch).props.disabled).toBe(true);
    await act(async () => { resolve({ data: null, error: { message: 'Admin access required.' } }); });
    expect(renderer!.root.findByType(Switch).props.value).toBe(true);
    expect(JSON.stringify(renderer!.toJSON())).toContain('admin.registration.saveError');
  });
});
