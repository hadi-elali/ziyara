import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '@/components/ui/button';
import { AdminMeetingPointPanel } from '@/features/trip-guidance/AdminMeetingPointPanel';
import { MeetingPointPicker } from '@/features/trip-guidance/MeetingPointPicker';

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ error: null }>>()
  .mockResolvedValue({ error: null });
const mockRefresh = jest.fn(async () => {});

jest.mock('@/features/auth/supabase', () => ({ supabase: { rpc: (...args: Parameters<typeof mockRpc>) => mockRpc(...args) } }));
jest.mock('@/features/trip-guidance/trip-guidance-context', () => ({
  useTripGuidance: () => ({
    activeTrip: null,
    hasSyncError: false,
    isLoading: false,
    navigationDestinations: [],
    refresh: mockRefresh,
    syncErrorMessage: null,
  }),
}));
jest.mock('@/features/trip-guidance/MeetingPointPicker', () => ({ MeetingPointPicker: () => null }));
jest.mock('@/features/places/openNavigation', () => ({ openNavigation: jest.fn() }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, isRTL: false }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#127456' }) }));
jest.mock('@/constants/theme', () => ({
  Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24 },
}));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'Text' }));
jest.mock('@/components/ui/card', () => ({ Card: 'View' }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null = null;

describe('AdminMeetingPointPanel', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  afterEach(async () => { await act(async () => renderer?.unmount()); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

  it('veröffentlicht einen benannten Kartenmarker ohne aktive Zwischenreise', async () => {
    await act(async () => { renderer = create(<AdminMeetingPointPanel />); });
    const root = renderer!.root;
    const publishButton = () => root.findAllByType(Button).find(
      (button) => button.props.label === 'navigation.admin.create',
    )!;
    expect(publishButton().props.disabled).toBe(true);

    await act(async () => {
      root.findAllByType(TextInput).find(
        (input) => input.props.accessibilityLabel === 'navigation.admin.name',
      )!.props.onChangeText('Hotel');
      root.findByType(MeetingPointPicker).props.onChange({ latitude: 32.616, longitude: 44.032 });
    });
    expect(publishButton().props.disabled).toBe(false);
    await act(async () => { await publishButton().props.onPress(); });

    expect(mockRpc).toHaveBeenCalledWith('admin_upsert_trip_navigation_destination', {
      p_destination_id: null,
      p_details: '',
      p_latitude: 32.616,
      p_longitude: 44.032,
      p_name: 'Hotel',
      p_trip_id: null,
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
