import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PropsWithChildren, ReactNode } from 'react';
import { BackHandler, Modal, Platform, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import RootLayout from '@/app/_layout';
import { Button } from '@/components/ui/button';

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() };
let mockPathname = '/';

const mockAuth = {
  hasProfileError: false,
  isAdmin: false,
  isLoading: true,
  profileRefreshError: null,
  session: null as { user: { id: string } } | null,
};
const mockCheck = { activeCheck: null, hasSyncError: false, isBlocking: false, isLoading: true };
let mockHomeLocked = false;

jest.mock('@/features/home-lock/use-home-lock', () => ({ useHomeLock: () => mockHomeLocked }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('expo-router', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  const MockStack = ({ children }: PropsWithChildren) => <MockView testID="stack">{children}</MockView>;
  MockStack.Screen = function MockScreen({ name, options }: {
    name: string;
    options?: { headerLeft?: () => ReactNode };
  }) {
    return <MockView accessibilityLabel={name} testID="route">{options?.headerLeft?.()}</MockView>;
  };
  MockStack.Protected = function MockProtected({ guard, children }: PropsWithChildren<{ guard: boolean }>) {
    return guard ? children : null;
  };
  return {
    DarkTheme: {}, DefaultTheme: {}, Stack: MockStack,
    ThemeProvider: ({ children }: PropsWithChildren) => children,
    usePathname: () => mockPathname,
    useRouter: () => mockRouter,
  };
});
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hideAsync: jest.fn(async () => undefined),
}));
jest.mock('@/features/auth/auth-context', () => ({
  AuthProvider: ({ children }: PropsWithChildren) => children,
  useAuth: () => mockAuth,
}));
jest.mock('@/features/group-check/group-check-context', () => ({
  GroupCheckProvider: ({ children }: PropsWithChildren) => children,
  useGroupCheck: () => mockCheck,
}));
jest.mock('@/features/i18n/i18n', () => ({
  AppI18nProvider: ({ children }: PropsWithChildren) => children,
  useI18n: () => ({ loaded: true, t: (key: string) => key }),
}));
jest.mock('@/features/theme/theme-mode', () => ({
  AppThemeProvider: ({ children }: PropsWithChildren) => children,
  useThemeMode: () => ({ loaded: true, resolvedTheme: 'light' }),
}));
jest.mock('@/features/onboarding/onboarding-state', () => ({
  useOnboarding: () => ({ loaded: true, hasCompletedOnboarding: true }),
}));
jest.mock('@/features/errors/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@/features/bus-management/bus-management-context', () => ({
  BusManagementProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@/features/daily-program/daily-program-context', () => ({
  DailyProgramProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@/features/general-alarm/general-alarm-notifications-context', () => ({
  GeneralAlarmNotificationsProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@/features/question-round/question-round-context', () => ({
  QuestionRoundProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@/features/trip-guidance/trip-guidance-context', () => ({
  TripGuidanceProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@/features/trip-groups/trip-group-context', () => ({
  TripGroupProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@/features/wake-up-call/wake-up-call-context', () => ({
  WakeUpCallProvider: ({ children }: PropsWithChildren) => children,
}));
jest.mock('@/components/themed-text', () => ({ ThemedText: () => null }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null = null;
let hardwareBack: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
const removeBackListener = jest.fn();
const backPressEvent = { type: 'hardwareBackPress', timeStamp: 1 };

async function renderNavigation() {
  await act(async () => {
    if (renderer) renderer.update(<RootLayout />);
    else renderer = create(<RootLayout />);
  });
  if (!renderer) throw new Error('Navigation wurde nicht gerendert.');
  return (renderer as ReactTestRenderer).root.findAllByType(View)
    .filter((node) => node.props.testID === 'route')
    .map((node) => node.props.accessibilityLabel as string);
}

describe('root startup route guards', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/';
    mockRouter.canGoBack.mockReturnValue(false);
    hardwareBack = undefined;
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      hardwareBack = handler;
      return { remove: removeBackListener };
    });
    mockHomeLocked = false;
    Object.assign(mockAuth, { hasProfileError: false, isAdmin: false, isLoading: true, session: null });
    Object.assign(mockCheck, { hasSyncError: false, isBlocking: false, isLoading: true });
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    jest.restoreAllMocks();
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment; });

  it('registriert während des Kaltstarts keine Statusabfrage und öffnet danach direkt Home', async () => {
    let routes = await renderNavigation();
    expect(routes[0]).toBe('startup');
    expect(routes).not.toContain('check-in');
    expect(routes).not.toContain('(tabs)');
    expect(routes).toContain('emergency-dashboard');

    Object.assign(mockAuth, { isLoading: false, session: { user: { id: 'restored-user' } } });
    mockCheck.isBlocking = true;
    routes = await renderNavigation();
    expect(routes[0]).toBe('startup');
    expect(routes).not.toContain('check-in');

    Object.assign(mockCheck, { isLoading: false, isBlocking: false });
    routes = await renderNavigation();
    expect(routes[0]).toBe('(tabs)');
    expect(routes).not.toContain('startup');
  });

  it('wählt nach einer tatsächlichen Blockade die Statusabfrage als ersten verfügbaren Screen', async () => {
    Object.assign(mockAuth, { isLoading: false, session: { user: { id: 'restored-user' } } });
    Object.assign(mockCheck, { isLoading: false, isBlocking: true });
    expect((await renderNavigation())[0]).toBe('check-in');
  });

  it('lässt Profilfehler nicht endlos im Startzustand warten', async () => {
    Object.assign(mockAuth, { isLoading: false, hasProfileError: true, session: { user: { id: 'restored-user' } } });
    expect((await renderNavigation())[0]).toBe('check-in');
  });

  it('öffnet den Gastguide ohne private Gruppencheck-Abfragen', async () => {
    mockAuth.isLoading = false;
    expect((await renderNavigation())[0]).toBe('(tabs)');
  });

  it('verdeckt den bereiten Homebildschirm bei lock true und gibt ihn bei false wieder frei', async () => {
    mockAuth.isLoading = false;
    mockHomeLocked = true;
    await renderNavigation();
    expect(renderer?.root.findAllByType(Modal)).toHaveLength(1);

    mockHomeLocked = false;
    await renderNavigation();
    expect(renderer?.root.findAllByType(Modal)).toHaveLength(0);
  });

  it.each(['/emergency', '/emergency-dashboard'])(
    'bietet nach direktem Push-Einstieg in %s einen Zurück-Knopf zu Home',
    async (pathname) => {
      mockPathname = pathname;
      mockAuth.isLoading = false;
      await renderNavigation();

      const route = renderer!.root.findByProps({ accessibilityLabel: pathname.slice(1) });
      const button = route.findByType(Button);
      expect(button.props.label).toBe('common.back');
      await act(async () => { button.props.onPress(); });
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
      expect(mockRouter.back).not.toHaveBeenCalled();
    },
  );

  it('verwendet beim Zurück-Knopf einen vorhandenen Navigationsverlauf', async () => {
    mockPathname = '/emergency-dashboard';
    mockAuth.isLoading = false;
    mockRouter.canGoBack.mockReturnValue(true);
    await renderNavigation();

    const route = renderer!.root.findByProps({ accessibilityLabel: 'emergency-dashboard' });
    await act(async () => { route.findByType(Button).props.onPress(); });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it.each(['/emergency', '/emergency-dashboard'])(
    'fängt Android-Zurück ohne Verlauf auf %s ab und öffnet Home',
    async (pathname) => {
      mockPathname = pathname;
      mockAuth.isLoading = false;
      await renderNavigation();

      expect(hardwareBack?.(backPressEvent)).toBe(true);
      expect(mockRouter.replace).toHaveBeenCalledWith('/');
    },
  );

  it('überlässt Android-Zurück mit Verlauf dem Navigator', async () => {
    mockPathname = '/emergency-dashboard';
    mockAuth.isLoading = false;
    mockRouter.canGoBack.mockReturnValue(true);
    await renderNavigation();

    expect(hardwareBack?.(backPressEvent)).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('führt nach Kaltstart und einer tatsächlichen Pflichtabfrage zur Statusseite zurück', async () => {
    mockPathname = '/emergency-dashboard';
    Object.assign(mockAuth, { isLoading: false, session: { user: { id: 'restored-user' } } });
    await renderNavigation();
    // Startup is removed while the notification target remains as the only screen.
    Object.assign(mockCheck, { isLoading: false, isBlocking: true });
    await renderNavigation();

    expect(hardwareBack?.(backPressEvent)).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/check-in');
  });

  it('wartet beim Rückweg auf eine noch ladende Startprüfung', async () => {
    mockPathname = '/emergency-dashboard';
    await renderNavigation();

    expect(hardwareBack?.(backPressEvent)).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/startup');
  });

  it('entfernt die Android-Sonderbehandlung beim Verlassen der Notfallseite', async () => {
    mockPathname = '/emergency-dashboard';
    mockAuth.isLoading = false;
    await renderNavigation();
    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(1);

    mockPathname = '/settings';
    await renderNavigation();
    expect(removeBackListener).toHaveBeenCalledTimes(1);
    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(1);
  });

  it.each(['ios', 'web'] as const)('registriert auf %s keinen Android-Handler', async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    mockPathname = '/emergency-dashboard';
    mockAuth.isLoading = false;
    await renderNavigation();

    expect(BackHandler.addEventListener).not.toHaveBeenCalled();
  });
});
