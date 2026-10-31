import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createPersistentState } from '@/features/storage/persistentState';

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let useTourState: typeof import('./home-tour-state').useHomeTourState;
let state: ReturnType<typeof useTourState>;
let renderer: ReactTestRenderer | undefined;

function loadFreshStore() {
  jest.isolateModules(() => {
    jest.doMock('@/features/storage/persistentState', () => ({ createPersistentState }));
    useTourState = jest.requireActual<typeof import('./home-tour-state')>('./home-tour-state').useHomeTourState;
  });
}
function Probe() {
  const nextState = useTourState();
  React.useEffect(() => { state = nextState; }, [nextState]);
  return null;
}
async function mount() {
  await act(async () => { renderer = create(<Probe />); });
}

describe('persistent Home tour completion', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    loadFreshStore();
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('speichert den Abschluss getrennt vom Video-Intro und lädt ihn nach einem Neustart', async () => {
    await AsyncStorage.setItem('ziyara.onboarding.completed', 'true');
    await mount();
    expect(state[0]).toBe(false);
    expect(state[2]).toBe(true);
    await act(async () => state[1](true));
    expect(await AsyncStorage.getItem('ziyara.home-tour.completed.v1')).toBe('true');
    await act(async () => renderer?.unmount());
    loadFreshStore();
    await mount();
    expect(state[0]).toBe(true);
    expect(state[2]).toBe(true);
  });

  it.each(['"true"', '{', '123'])('behandelt den unbrauchbaren Speicherwert %s als unvollständig', async stored => {
    await AsyncStorage.setItem('ziyara.home-tour.completed.v1', stored);
    await mount();
    expect(state[0]).toBe(false);
    expect(state[2]).toBe(true);
  });
});
