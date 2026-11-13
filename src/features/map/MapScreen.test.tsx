import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '@/components/ui/button';
import type { TripNavigationDestination } from '@/domain/database';
import { MapCanvas } from '@/features/map/MapCanvas';
import { MapExperience } from '@/features/map/MapScreen';
import { openNavigation } from '@/features/places/openNavigation';

const destination: TripNavigationDestination = {
  id: 7, name: 'Hotel', details: 'Tor 3', latitude: 32.616, longitude: 44.032,
  archived_at: null, created_at: '', created_by_profile_id: null, sort_order: 0,
  trip_id: null, updated_at: '',
};
const mockGuidance = { navigationDestinations: [destination] };
jest.mock('@/features/trip-guidance/trip-guidance-context', () => ({ useTripGuidance: () => mockGuidance }));
jest.mock('@/features/map/MapCanvas', () => ({ MapCanvas: () => null }));
jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@/data/places', () => ({ allPlaces: [] }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ language: 'de', t: (key: string) => key }) }));
jest.mock('@/features/places/openNavigation', () => ({ openNavigation: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#127456' }) }));
jest.mock('@/constants/theme', () => ({ Spacing: { one: 4, two: 8, three: 16, four: 24 } }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'Text' }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'View', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer;
const navigationButtons = () => renderer.root.findAllByType(Button).filter(node => node.props.label === 'common.navigate');

describe('Kartenauswahl bei Reisezieländerungen', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGuidance.navigationDestinations = [destination];
    await act(async () => { renderer = create(<MapExperience />); });
    await act(async () => { renderer.root.findByType(MapCanvas).props.onPointPress('destination:7'); });
    expect(navigationButtons()).toHaveLength(1);
  });
  afterEach(async () => { await act(async () => { renderer.unmount(); }); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

  it('entfernt Marker und geöffnete Detailkarte, wenn ein anderer Admin das Ziel entfernt', async () => {
    mockGuidance.navigationDestinations = [];
    await act(async () => { renderer.update(<MapExperience />); });
    expect(renderer.root.findByType(MapCanvas).props.points).toEqual([]);
    expect(navigationButtons()).toHaveLength(0);
  });

  it('verwendet beim Navigieren die aktuellen Koordinaten des ausgewählten Ziels', async () => {
    const updated = { ...destination, name: 'Neues Hotel', latitude: 33, longitude: 45 };
    mockGuidance.navigationDestinations = [updated];
    await act(async () => { renderer.update(<MapExperience />); });
    await act(async () => { navigationButtons()[0].props.onPress(); });
    expect(openNavigation).toHaveBeenCalledWith(updated);
  });
});
