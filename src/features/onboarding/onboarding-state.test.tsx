import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { OnboardingProvider, useOnboarding } from '@/features/onboarding/onboarding-state';

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | undefined;
let state: ReturnType<typeof useOnboarding>;

function Consumer() {
  const nextState = useOnboarding();
  useEffect(() => { state = nextState; }, [nextState]);
  return null;
}

async function renderIntro(key = 'initial') {
  await act(async () => {
    const content = <OnboardingProvider><Consumer key={key} /></OnboardingProvider>;
    if (renderer) renderer.update(content);
    else renderer = create(content);
  });
}

describe('onboarding per app launch', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    await AsyncStorage.clear();
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('zeigt das Intro auch bei einem alten gespeicherten Abschluss und erhält die Sprache', async () => {
    await AsyncStorage.setItem('ziyara.onboarding.completed', 'true');
    await AsyncStorage.setItem('ziyara.language', '"ar"');
    await renderIntro();
    expect(state.hasCompletedOnboarding).toBe(false);
    await act(async () => state.completeOnboarding());
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(await AsyncStorage.getItem('ziyara.language')).toBe('"ar"');
  });

  it('behält Weiter innerhalb eines Starts bei und zeigt das Intro beim nächsten Start erneut', async () => {
    await renderIntro();
    await act(async () => state.completeOnboarding());
    await renderIntro('next-screen');
    expect(state.hasCompletedOnboarding).toBe(true);

    await act(async () => renderer?.unmount());
    renderer = undefined;
    await renderIntro();
    expect(state.hasCompletedOnboarding).toBe(false);
  });
});
