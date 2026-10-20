import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  inspectGeneralAlarmNotificationState,
  registerGeneralAlarmNotifications,
  subscribeToEmergencyDashboardNotificationResponses,
} from '@/features/general-alarm/general-alarm-notifications';
import {
  GeneralAlarmNotificationsProvider,
  useGeneralAlarmNotifications,
} from '@/features/general-alarm/general-alarm-notifications-context';

const mockRouter = { push: jest.fn() };
let mockRootState: { key: string } | undefined;
const mockAuthState = { isAdmin: false, isLoading: false, session: { user: { id: 'user-1' } } };
const mockI18n = { language: 'de', t: (key: string) => key };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => mockRootState,
}));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => mockAuthState }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => mockI18n }));
jest.mock('@/features/general-alarm/useNotificationPreference', () => ({
  useNotificationsDisabled: () => {
    const React = jest.requireActual<typeof import('react')>('react');
    return [...React.useState(false), true];
  },
}));
jest.mock('@/features/general-alarm/general-alarm-notifications', () => ({
  cancelGeneralAlarmReminders: jest.fn(async () => undefined),
  inspectGeneralAlarmNotificationState: jest.fn(),
  openGeneralAlarmNotificationSettings: jest.fn(),
  registerGeneralAlarmNotifications: jest.fn(),
  subscribeToEmergencyDashboardNotificationResponses: jest.fn(() => ({ remove: jest.fn() })),
  subscribeToEmergencyNotificationResponses: jest.fn(() => ({ remove: jest.fn() })),
  subscribeToGeneralAlarmNotificationResponses: jest.fn(() => ({ remove: jest.fn() })),
  subscribeToWakeUpCallNotificationResponses: jest.fn(() => ({ remove: jest.fn() })),
  syncGeneralAlarmReminders: jest.fn(async () => undefined),
  unregisterGeneralAlarmNotifications: jest.fn(async () => undefined),
}));

let renderer: ReactTestRenderer | null;
let currentContext: ReturnType<typeof useGeneralAlarmNotifications>;
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;

function Probe() {
  const context = useGeneralAlarmNotifications();
  useEffect(() => { currentContext = context; }, [context]);
  return null;
}

function tree() {
  return <GeneralAlarmNotificationsProvider><Probe /></GeneralAlarmNotificationsProvider>;
}

describe('GeneralAlarmNotificationsProvider', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.clearAllMocks();
    renderer = null;
    mockRootState = { key: 'root' };
    mockAuthState.isLoading = false;
    jest.mocked(inspectGeneralAlarmNotificationState).mockResolvedValue({
      availability: 'checking', permissionGranted: true,
    });
    jest.mocked(registerGeneralAlarmNotifications).mockResolvedValue({
      availability: 'error', permissionGranted: true, errorMessage: 'Network request failed',
    });
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment; });

  it('bleibt bei fehlgeschlagener Tokenregistrierung trotz Berechtigung erneut aktivierbar', async () => {
    await act(async () => { renderer = create(tree()); });
    expect(currentContext.permissionGranted).toBe(true);
    expect(currentContext.availability).toBe('error');
    expect(currentContext.enabled).toBe(false);

    jest.mocked(registerGeneralAlarmNotifications).mockResolvedValue({
      availability: 'registered', permissionGranted: true,
    });
    await act(async () => { await currentContext.enable(); });
    expect(registerGeneralAlarmNotifications).toHaveBeenLastCalledWith('de', true);
    expect(currentContext.enabled).toBe(true);
    expect(currentContext.isWorking).toBe(false);
  });

  it('öffnet einen Notfall-Push beim Kaltstart erst nach Navigation und Auth-Laden', async () => {
    mockRootState = undefined;
    mockAuthState.isLoading = true;
    await act(async () => { renderer = create(tree()); });
    const onResponse = jest.mocked(subscribeToEmergencyDashboardNotificationResponses).mock.calls[0][0];
    await act(async () => { onResponse(); });
    expect(mockRouter.push).not.toHaveBeenCalled();

    mockRootState = { key: 'root' };
    await act(async () => { renderer?.update(tree()); });
    expect(mockRouter.push).not.toHaveBeenCalled();

    mockAuthState.isLoading = false;
    await act(async () => { renderer?.update(tree()); });
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith('/emergency-dashboard');
  });
});
