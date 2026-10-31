import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEventListener } from 'expo';
import { router } from 'expo-router';
import { VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Animated } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import OnboardingScreen from '@/app/onboarding';
import { AppI18nProvider, useI18n } from '@/features/i18n/i18n';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/onboarding-state';

jest.mock('expo', () => ({ useEventListener: jest.fn() }));
jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('expo-image', () => ({ Image: () => null }));
const mockPlayer = { audioMixingMode: '', loop: true, muted: true, volume: 0, pause: jest.fn(), play: jest.fn() };
const mockAuth = {
  hasProfileError: false, isAdmin: false, isLoading: false,
  session: null as { user: { id: string } } | null,
};
const mockGroupCheck = { isLoading: false };
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/group-check/group-check-context', () => ({ useGroupCheck: () => mockGroupCheck }));
jest.mock('expo-video', () => ({
  useVideoPlayer: (_source: unknown, setup: (player: typeof mockPlayer) => void) => {
    setup(mockPlayer);
    return mockPlayer;
  },
  VideoView: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('@/components/themed-text', () => ({
  ThemedText: jest.requireActual<typeof import('react-native')>('react-native').Text,
}));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | undefined;
let hasCompletedIntro = false;

function IntroProbe() {
  const { hasCompletedOnboarding } = useOnboarding();
  useEffect(() => { hasCompletedIntro = hasCompletedOnboarding; }, [hasCompletedOnboarding]);
  return null;
}

function LoadedIntro() {
  const { loaded } = useI18n();
  return loaded ? <><OnboardingScreen /><IntroProbe /></> : null;
}

async function renderIntro() {
  await act(async () => {
    const content = (
      <AppI18nProvider>
        <OnboardingProvider><LoadedIntro /></OnboardingProvider>
      </AppI18nProvider>
    );
    if (renderer) renderer.update(content);
    else renderer = create(content);
  });
}

function videoEnded() {
  const listeners = jest.mocked(useEventListener).mock.calls.filter(call => call[1] === 'playToEnd');
  const onEnd = listeners[listeners.length - 1][2] as () => void;
  onEnd();
}

function button(label: string) {
  const buttons = renderer!.root.findAll(node =>
    node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  );
  const found = buttons.find(node =>
    node.findAll(text => text.props.children === label).length > 0,
  );
  if (!found) throw new Error(`Button ${label} fehlt.`);
  return found;
}

describe('intro interaction', () => {
  beforeAll(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });
  afterAll(() => {
    jest.useRealTimers();
    actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });

  it('bestätigt die Sprache einmal und leitet später am Videoende erst nach bereiter Startprüfung weiter', async () => {
    mockAuth.isLoading = true;
    await renderIntro();
    expect(renderer!.root.findAll(node => node.props.children === 'Weiter')).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(2200); });
    await act(async () => videoEnded());
    expect(hasCompletedIntro).toBe(false);

    const reportStatus = jest.mocked(useEventListener).mock.calls[0][2] as (event: { status: string }) => void;
    await act(async () => reportStatus({ status: 'error' }));
    await act(async () => button('English').props.onPress());
    expect(button('English').props.accessibilityState).toEqual({ busy: true, disabled: true, selected: true });
    expect(renderer!.root.findAll(node => node.props.children === 'Continue')).toHaveLength(0);
    expect(hasCompletedIntro).toBe(false);
    expect(renderer!.root.findAll(node =>
      node.props.children === 'The introduction video cannot be played right now. You can still continue.',
    ).length).toBeGreaterThan(0);
    mockAuth.isLoading = false;
    await renderIntro();
    expect(hasCompletedIntro).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('ziyara.language')).toBe('"en"');

    await act(async () => renderer?.unmount());
    renderer = undefined;
    mockAuth.isLoading = true;
    await renderIntro();
    expect(hasCompletedIntro).toBe(false);
    expect(button('Continue')).toBeDefined();
    expect(renderer!.root.findAllByType(Animated.View)).toHaveLength(0);
    expect(renderer!.root.findAll(node => node.props.children === 'English')).toHaveLength(0);
    expect(renderer!.root.findAll(node => node.props.children === 'Choose your language')).toHaveLength(0);
    expect(renderer!.root.findAllByType(VideoView)).toHaveLength(1);
    expect(mockPlayer.loop).toBe(false);
    expect(mockPlayer.play).toHaveBeenCalled();

    await act(async () => videoEnded());
    expect(hasCompletedIntro).toBe(false);
    expect(button('Continue').props.accessibilityState.busy).toBe(true);
    expect(renderer!.root.findAllByType(VideoView)).toHaveLength(1);

    mockAuth.isLoading = false;
    mockAuth.session = { user: { id: 'restored-user' } };
    mockGroupCheck.isLoading = true;
    await renderIntro();
    expect(hasCompletedIntro).toBe(false);

    mockGroupCheck.isLoading = false;
    await renderIntro();
    expect(hasCompletedIntro).toBe(true);
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
