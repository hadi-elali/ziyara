import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { StatusBar } from 'expo-status-bar';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { HomeLockScreen } from '@/features/home-lock/HomeLockScreen';

jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null = null;

async function renderScreen(locked: boolean, pathname = '/') {
  await act(async () => {
    const screen = <HomeLockScreen locked={locked} pathname={pathname} />;
    if (renderer) renderer.update(screen);
    else renderer = create(screen);
  });
  if (!renderer) throw new Error('Sperrbildschirm wurde nicht gerendert.');
  return (renderer as ReactTestRenderer).root;
}

describe('HomeLockScreen', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment; });

  it('verdeckt Home und die native Tab-Leiste vollständig ohne Text oder Schaltflächen', async () => {
    const root = await renderScreen(true);
    const modal = root.findByType(Modal);
    const screen = root.findAllByType(View).find((node) => node.props.testID === 'home-lock-screen');
    expect(modal.props).toMatchObject({ visible: true, presentationStyle: 'fullScreen' });
    expect(StyleSheet.flatten(screen?.props.style)).toMatchObject({ backgroundColor: '#000000', flex: 1 });
    expect(root.findByType(StatusBar).props.hidden).toBe(true);
    expect(root.findAllByType(Text)).toHaveLength(0);

    await act(async () => modal.props.onRequestClose());
    expect(root.findByType(Modal).props.visible).toBe(true);
  });

  it('gibt Home wieder frei, sobald lock false ist', async () => {
    await renderScreen(true);
    const root = await renderScreen(false);
    expect(root.findAllByType(Modal)).toHaveLength(0);
    expect(root.findAllByType(StatusBar)).toHaveLength(0);
  });

  it.each(['/map', '/settings', '/login', '/check-in', '/emergency'])('verdeckt die Route %s nicht', async (pathname) => {
    const root = await renderScreen(true, pathname);
    expect(root.findAllByType(Modal)).toHaveLength(0);
  });
});
