import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Modal, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '@/components/ui/button';
import type { TripNavigationDestination } from '@/domain/database';
import { openNavigation } from '@/features/places/openNavigation';
import { AdminMeetingPointPanel } from '@/features/trip-guidance/AdminMeetingPointPanel';
import { MeetingPointPicker } from '@/features/trip-guidance/MeetingPointPicker';

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ error: { message: string } | null }>>()
  .mockResolvedValue({ error: null });
const mockRefresh = jest.fn(async () => {});
const mockGuidance = {
  hasSyncError: false,
  isLoading: false,
  navigationDestinations: [] as TripNavigationDestination[],
  refresh: mockRefresh,
  syncErrorMessage: null as string | null,
};
const mockI18n = { t: (key: string) => key, isRTL: false };

jest.mock('@/features/auth/supabase', () => ({ supabase: { rpc: (...args: Parameters<typeof mockRpc>) => mockRpc(...args) } }));
jest.mock('@/features/trip-guidance/trip-guidance-context', () => ({
  useTripGuidance: () => mockGuidance,
}));
jest.mock('@/features/trip-guidance/MeetingPointPicker', () => ({ MeetingPointPicker: () => null }));
jest.mock('@/features/places/openNavigation', () => ({ openNavigation: jest.fn() }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => mockI18n }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#127456' }) }));
jest.mock('@/constants/theme', () => ({
  Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24 },
  MaxContentWidth: 800,
}));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'Text' }));
jest.mock('@/components/ui/card', () => ({ Card: 'View' }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'View' }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null = null;

const destination: TripNavigationDestination = {
  id: 7, name: 'Hotel', details: 'Eingang am Parkplatz', latitude: 32.616, longitude: 44.032,
  archived_at: null, created_at: '', created_by_profile_id: null, sort_order: 0,
  trip_id: null, updated_at: '',
};

function button(key: string) {
  return renderer!.root.findAllByType(Button).find(node => node.props.label === key)!;
}
function input(key: string) {
  return renderer!.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === key)!;
}
function destinationAction(key: string) {
  return renderer!.root.findAll(node =>
    node.props.accessibilityLabel === `${key}: ${destination.name}` && typeof node.props.onPress === 'function',
  )[0];
}
async function render() {
  await act(async () => { renderer = create(<AdminMeetingPointPanel />); });
}

describe('AdminMeetingPointPanel', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockReset().mockResolvedValue({ error: null });
    mockGuidance.navigationDestinations = [];
    mockGuidance.hasSyncError = false;
    mockGuidance.isLoading = false;
    mockGuidance.syncErrorMessage = null;
    mockI18n.isRTL = false;
    renderer = null;
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

  it('veröffentlicht einen benannten Kartenmarker ohne aktive Zwischenreise', async () => {
    await act(async () => { renderer = create(<AdminMeetingPointPanel />); });
    expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
    await act(async () => { button('navigation.admin.add').props.onPress(); });
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
    expect(root.findByType(Modal).props.visible).toBe(false);
  });

  it('öffnet bestehende Ziele mit ihren Werten und speichert unter derselben ID', async () => {
    mockGuidance.navigationDestinations = [destination];
    await render();
    await act(async () => { destinationAction('navigation.admin.edit').props.onPress(); });
    expect(input('navigation.admin.name').props.value).toBe('Hotel');
    expect(input('navigation.admin.details').props.value).toBe(destination.details);
    expect(renderer!.root.findByType(MeetingPointPicker).props.coordinate).toEqual({ latitude: 32.616, longitude: 44.032 });
    await act(async () => { input('navigation.admin.name').props.onChangeText('  Hotel 2  '); });
    await act(async () => { await button('navigation.admin.save').props.onPress(); });
    expect(mockRpc).toHaveBeenCalledWith('admin_upsert_trip_navigation_destination', expect.objectContaining({
      p_destination_id: 7, p_name: 'Hotel 2', p_details: destination.details,
      p_latitude: 32.616, p_longitude: 44.032,
    }));
    expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
  });

  it('bricht ohne Mutation ab und öffnet ein neues Ziel mit leerem Formular', async () => {
    mockGuidance.navigationDestinations = [destination];
    await render();
    await act(async () => { destinationAction('navigation.admin.edit').props.onPress(); });
    await act(async () => { button('guide.admin.cancelNew').props.onPress(); });
    expect(mockRpc).not.toHaveBeenCalled();
    await act(async () => { button('navigation.admin.add').props.onPress(); });
    expect(input('navigation.admin.name').props.value).toBe('');
    expect(renderer!.root.findByType(MeetingPointPicker).props.coordinate).toBeNull();
    expect(button('navigation.admin.create').props.disabled).toBe(true);
    await act(async () => { renderer!.root.findByType(Modal).props.onRequestClose(); });
    expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
  });

  it('behält bei Speicherfehlern den Entwurf und erlaubt einen neuen Versuch', async () => {
    mockGuidance.navigationDestinations = [destination];
    mockRpc.mockResolvedValueOnce({ error: { message: 'Verbindung unterbrochen' } });
    await render();
    await act(async () => { destinationAction('navigation.admin.edit').props.onPress(); });
    await act(async () => { await button('navigation.admin.save').props.onPress(); });
    expect(renderer!.root.findByType(Modal).props.visible).toBe(true);
    expect(input('navigation.admin.name').props.value).toBe('Hotel');
    expect(renderer!.root.findAll(node => node.props.children === 'Verbindung unterbrochen').length).toBeGreaterThan(0);
    expect(button('navigation.admin.save').props.disabled).toBe(false);
    await act(async () => { await button('navigation.admin.save').props.onPress(); });
    expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('sperrt Formular und Schließen während des Speicherns', async () => {
    mockGuidance.navigationDestinations = [destination];
    let finish!: (result: { error: null }) => void;
    mockRpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await render();
    await act(async () => { destinationAction('navigation.admin.edit').props.onPress(); });
    await act(async () => { button('navigation.admin.save').props.onPress(); });
    expect(button('navigation.admin.save').props.disabled).toBe(true);
    expect(button('guide.admin.cancelNew').props.disabled).toBe(true);
    expect(input('navigation.admin.name').props.editable).toBe(false);
    await act(async () => {
      renderer!.root.findByType(Modal).props.onRequestClose();
      renderer!.root.findByType(MeetingPointPicker).props.onChange({ latitude: 0, longitude: 0 });
    });
    expect(renderer!.root.findByType(Modal).props.visible).toBe(true);
    expect(input('guide.admin.meetingLatitude').props.value).toBe('32.616');
    await act(async () => { finish({ error: null }); });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
  });

  it('entfernt erst nach ausdrücklicher Bestätigung und erlaubt Abbrechen', async () => {
    mockGuidance.navigationDestinations = [destination];
    await render();
    await act(async () => { destinationAction('navigation.admin.remove').props.onPress(); });
    expect(mockRpc).not.toHaveBeenCalled();
    await act(async () => { button('guide.admin.cancelNew').props.onPress(); });
    expect(button('navigation.admin.removeConfirm')).toBeUndefined();
    await act(async () => { destinationAction('navigation.admin.remove').props.onPress(); });
    await act(async () => { await button('navigation.admin.removeConfirm').props.onPress(); });
    expect(mockRpc).toHaveBeenCalledWith('admin_archive_trip_navigation_destination', { p_destination_id: 7 });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(button('navigation.admin.removeConfirm')).toBeUndefined();
  });

  it('öffnet die Navigation für das gewählte Ziel', async () => {
    mockGuidance.navigationDestinations = [destination];
    await render();
    await act(async () => { destinationAction('navigation.admin.preview').props.onPress(); });
    expect(openNavigation).toHaveBeenCalledWith(destination);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('behält bei Synchronisationsfehlern die Ziele mit einer Wiederholen-Aktion', async () => {
    mockGuidance.navigationDestinations = [destination];
    mockGuidance.hasSyncError = true;
    mockGuidance.syncErrorMessage = 'Verbindung unterbrochen';
    await render();
    expect(destinationAction('navigation.admin.edit')).toBeDefined();
    await act(async () => { await button('guide.retry').props.onPress(); });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('behält Koordinaten im arabischen Formular in LTR-Richtung', async () => {
    mockI18n.isRTL = true;
    mockGuidance.navigationDestinations = [destination];
    await render();
    await act(async () => { destinationAction('navigation.admin.edit').props.onPress(); });
    expect(input('navigation.admin.name').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ writingDirection: 'rtl', textAlign: 'right' }),
    ]));
    expect(input('guide.admin.meetingLatitude').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ writingDirection: 'ltr', textAlign: 'left' }),
    ]));
  });
});
