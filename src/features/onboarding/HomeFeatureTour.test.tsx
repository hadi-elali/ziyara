import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Modal, ScrollView } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '@/components/ui/button';
import { translate, type Language } from '@/features/i18n/i18n';
import { FeatureTourSlides, HomeFeatureTour } from '@/features/onboarding/HomeFeatureTour';

jest.mock('@/global.css', () => ({}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@likashefqet/react-native-image-zoom', () => ({
  Zoomable: jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View,
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
let mockLanguage: Language = 'de';
jest.mock('@/features/i18n/i18n', () => {
  const actual = jest.requireActual<typeof import('@/features/i18n/i18n')>('@/features/i18n/i18n');
  return {
    ...actual,
    useI18n: () => ({
      isRTL: mockLanguage === 'ar',
      t: (key: string, params?: Record<string, number | string>) => actual.translate(mockLanguage, key, params),
    }),
  };
});
let mockCompleted = false;
let mockLoaded = true;
const mockSetCompleted = jest.fn();
jest.mock('@/features/onboarding/home-tour-state', () => ({
  useHomeTourState: () => [mockCompleted, mockSetCompleted, mockLoaded],
}));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | undefined;

async function render(available = true) {
  await act(async () => {
    const content = <HomeFeatureTour available={available} />;
    if (renderer) renderer.update(content);
    else renderer = create(content);
  });
}

function press(label: string) {
  const button = renderer!.root.findAllByType(Button).find(node => node.props.label === label);
  if (!button) throw new Error(`Button ${label} fehlt.`);
  button.props.onPress();
}

function progress() {
  return renderer!.root.findAll(node => typeof node.props.children === 'string'
    && /^\d von 6$/.test(node.props.children)).map(node => node.props.children);
}

describe('Home feature tour', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    mockLanguage = 'de'; mockCompleted = false; mockLoaded = true;
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('wartet auf Home und die lokale Hydrierung, ohne den Abschluss vorzeitig zu speichern', async () => {
    mockLoaded = false;
    await render();
    expect(renderer!.root.findAllByType(FeatureTourSlides)).toHaveLength(0);
    mockLoaded = true;
    await render(false);
    expect(renderer!.root.findAllByType(FeatureTourSlides)).toHaveLength(0);
    await render();
    expect(renderer!.root.findAllByType(FeatureTourSlides)).toHaveLength(1);
    expect(mockSetCompleted).not.toHaveBeenCalled();
  });

  it('bietet Vor/Zurück und speichert erst beim Abschluss der letzten Folie', async () => {
    await render();
    expect(progress()).toContain('1 von 6');
    await act(async () => press('Weiter'));
    expect(progress()).toContain('2 von 6');
    await act(async () => press('Zurück'));
    expect(progress()).toContain('1 von 6');
    for (let i = 0; i < 5; i += 1) await act(async () => press('Weiter'));
    expect(progress()).toContain('6 von 6');
    expect(mockSetCompleted).not.toHaveBeenCalled();
    await act(async () => press('Los geht’s'));
    expect(mockSetCompleted).toHaveBeenCalledWith(true);
  });

  it('gleicht die Navigation nach einer Wischgeste mit der sichtbaren Folie ab', async () => {
    await render();
    const pager = renderer!.root.findAllByType(ScrollView).find(node => node.props.horizontal)!;
    await act(async () => pager.props.onMomentumScrollEnd({ nativeEvent: {
      contentOffset: { x: pager.props.children[0].props.style.width * 4 },
    } }));
    expect(progress()).toContain('5 von 6');
    await act(async () => press('Weiter'));
    expect(progress()).toContain('6 von 6');
  });

  it('überspringt dauerhaft und zeigt einen gespeicherten Abschluss nicht automatisch erneut', async () => {
    await render();
    await act(async () => press('Überspringen'));
    expect(mockSetCompleted).toHaveBeenCalledWith(true);
    mockCompleted = true;
    await render();
    expect(renderer!.root.findAllByType(FeatureTourSlides)).toHaveLength(0);
  });

  it('zeigt das Tagesprogramm als zweite Folie und behält sie nach dem Vergrößern bei', async () => {
    await render();
    await act(async () => press('Weiter'));
    const openLabel = translate('de', 'homeTour.screenshot.open', { screen: translate('de', 'homeTour.program.title') });
    const screenshot = renderer!.root.findAll(node => node.props.accessibilityLabel === openLabel
      && typeof node.props.onPress === 'function')[0];
    await act(async () => screenshot.props.onPress());
    expect(renderer!.root.findAllByProps({ testID: 'home-tour-screenshot-viewer' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ testID: 'home-tour-pager' })).toHaveLength(0);
    await act(async () => press('Zur Einführung'));
    expect(progress()).toContain('2 von 6');
    expect(mockSetCompleted).not.toHaveBeenCalled();
  });

  it('schließt mit Android-Zurück zunächst die Bildansicht und erst danach die Einführung', async () => {
    await render();
    const openLabel = translate('de', 'homeTour.screenshot.open', { screen: translate('de', 'homeTour.home.title') });
    const screenshot = renderer!.root.findAll(node => node.props.accessibilityLabel === openLabel
      && typeof node.props.onPress === 'function')[0];
    await act(async () => screenshot.props.onPress());
    await act(async () => renderer!.root.findByType(Modal).props.onRequestClose());
    expect(progress()).toContain('1 von 6');
    expect(mockSetCompleted).not.toHaveBeenCalled();
    await act(async () => renderer!.root.findByType(Modal).props.onRequestClose());
    expect(mockSetCompleted).toHaveBeenCalledWith(true);
  });

  it.each<Language>(['de', 'en', 'ar'])('lässt sich in %s unabhängig vom Abschluss erneut öffnen', async language => {
    mockLanguage = language; mockCompleted = true;
    const onDismiss = jest.fn();
    await act(async () => { renderer = create(<FeatureTourSlides onDismiss={onDismiss} />); });
    expect(renderer!.root.findAll(node => node.props.children === translate(language, 'homeTour.home.title')).length).toBeGreaterThan(0);
    await act(async () => press(translate(language, 'homeTour.skip')));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(mockSetCompleted).not.toHaveBeenCalled();
  });
});
