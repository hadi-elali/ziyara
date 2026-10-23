import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import type { AccountFamily, AdminUserSummary, Trip } from '@/domain/database';
import { AdminBusManagementPanel } from '@/features/bus-management/AdminBusManagementPanel';
import { buildTripGroupStates } from '@/features/trip-groups/trip-group-state';

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ error: { message: string } | null }>>();
const mockRefresh = jest.fn(async () => {});
const mockRefreshGroups = jest.fn(async () => {});
let mockGroupError = false;
let mockActiveTrip: { id: number; name: string } | null = { id: 20, name: 'Testfahrt' };
let mockTrips: Trip[] = [];
const initialMockGroups = buildTripGroupStates(
  [{ id: 10, name: 'Gruppe A', created_at: '', updated_at: '' }],
  [
    { group_id: 10, user_id: 'leader', display_name: 'Leitung', is_leader: true, party_size: 1, family_name: null },
    { group_id: 10, user_id: 'member', display_name: 'Mitglied', is_leader: false, party_size: 3, family_name: null },
  ], [], null,
);

let mockGroups = initialMockGroups;

jest.mock('@/features/auth/supabase', () => ({
  supabase: { rpc: (...args: Parameters<typeof mockRpc>) => mockRpc(...args) },
}));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ session: { user: { id: 'admin' } } }) }));
jest.mock('@/features/bus-management/bus-management-context', () => ({
  useBusManagement: () => ({
    activeTrip: mockActiveTrip,
    buses: [{ id: 40, name: 'Bus 1', leader_participant_id: null }],
    participants: [], trips: mockTrips, hasSyncError: false, isLoading: false, refresh: mockRefresh,
  }),
}));
jest.mock('@/features/trip-groups/trip-group-context', () => ({
  useTripGroups: () => ({
    groups: mockGroups, isLoading: false, hasSyncError: mockGroupError,
    syncErrorMessage: mockGroupError ? 'Verbindung unterbrochen' : null,
    refresh: mockRefreshGroups,
  }),
}));
jest.mock('@/features/i18n/i18n', () => ({
  useI18n: () => ({ language: 'de', t: (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(' ')}` : key }),
}));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#127456' }) }));
jest.mock('@/constants/theme', () => ({ Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24 } }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'Text' }));
jest.mock('@/components/ui/card', () => ({ Card: 'View' }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null = null;
function root() {
  if (!renderer) throw new Error('Panel not mounted');
  return renderer.root;
}
function choice(label: string) {
  const result = root().findAll((row) => row.props.accessibilityRole === 'radio').find((row) =>
    row.findAllByType(ThemedText).some((text) => text.props.children === label),
  );
  if (!result) throw new Error(`Choice not found: ${label}`);
  return result;
}
function saveButton() {
  return root().findAllByType(Button).find((button) => button.props.label === 'bus.admin.saveGroupAssignment')!;
}
async function mountAndSelect() {
  await act(async () => { renderer = create(<AdminBusManagementPanel families={[]} users={[]} />); });
  await act(async () => {
    root().findAllByType(TextInput).find((field) => field.props.accessibilityLabel === 'bus.admin.groupSearch')?.props.onFocus();
  });
  await act(async () => { choice('Gruppe A').props.onPress(); });
  await act(async () => { choice('Bus 1').props.onPress(); });
}

describe('group bus assignment', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({ error: null });
    mockRefresh.mockClear();
    mockRefreshGroups.mockClear();
    mockGroupError = false;
    mockActiveTrip = { id: 20, name: 'Testfahrt' };
    mockTrips = [];
    mockGroups = initialMockGroups;
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); renderer = null; jest.restoreAllMocks(); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

  it('offers existing groups without searching and imports all members in one RPC', async () => {
    await mountAndSelect();
    expect(choice('bus.admin.group').props.accessibilityState.checked).toBe(true);
    expect(JSON.stringify(renderer?.toJSON())).toContain('Leitung');
    expect(JSON.stringify(renderer?.toJSON())).toContain('Mitglied');
    expect(saveButton().props.disabled).toBe(false);
    await act(async () => { saveButton().props.onPress(); });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('admin_assign_trip_group', { p_trip_id: 20, p_bus_id: 40, p_group_id: 10, p_leader_user_id: 'leader' });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer?.toJSON())).toContain('bus.admin.assignmentSaved');
    expect(saveButton().props.disabled).toBe(true);
  });

  it('requires a group leader choice when several leaders exist', async () => {
    const group = initialMockGroups[0];
    const secondLeader = { ...group.members[1], is_leader: true };
    mockGroups = [{ ...group, leaders: [group.leaders[0], secondLeader], members: [group.members[0], secondLeader] }];
    await mountAndSelect();
    expect(saveButton().props.disabled).toBe(true);
    await act(async () => { saveButton().props.onPress(); });
    expect(mockRpc).not.toHaveBeenCalled();
    await act(async () => { choice('Mitglied').props.onPress(); });
    expect(saveButton().props.disabled).toBe(false);
    await act(async () => { saveButton().props.onPress(); });
    expect(mockRpc).toHaveBeenCalledWith('admin_assign_trip_group', {
      p_trip_id: 20, p_bus_id: 40, p_group_id: 10, p_leader_user_id: 'member',
    });
  });

  it('keeps the selection for retry and explains a bus leader conflict', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'A group member leads another bus.' } });
    await mountAndSelect();
    await act(async () => { saveButton().props.onPress(); });
    expect(JSON.stringify(renderer?.toJSON())).toContain('bus.admin.groupLeaderConflict');
    expect(JSON.stringify(renderer?.toJSON())).toContain('bus.admin.selectedPerson Gruppe A');
    expect(saveButton().props.disabled).toBe(false);
    await act(async () => { saveButton().props.onPress(); });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('disables stale group choices and offers a refresh after a group sync failure', async () => {
    await mountAndSelect();
    mockGroupError = true;
    await act(async () => { renderer?.update(<AdminBusManagementPanel families={[]} users={[]} />); });
    expect(saveButton().props.disabled).toBe(true);
    await act(async () => { saveButton().props.onPress(); });
    expect(mockRpc).not.toHaveBeenCalled();
    const retry = root().findAllByType(Button).find((button) => button.props.label === 'bus.retry')!;
    await act(async () => { retry.props.onPress(); });
    expect(mockRefreshGroups).toHaveBeenCalledTimes(1);
  });

  it('creates an empty bus without requiring a leader selection', async () => {
    await act(async () => { renderer = create(<AdminBusManagementPanel families={[]} users={[]} />); });
    const nameInput = root().findAllByType(TextInput).find((input) => input.props.accessibilityLabel === 'bus.admin.busName')!;
    await act(async () => { nameInput.props.onChangeText('Bus 2'); });
    const createBus = root().findAllByType(Button).find((button) => button.props.label === 'bus.admin.addBus')!;
    expect(createBus.props.disabled).toBe(false);
    await act(async () => { createBus.props.onPress(); });
    expect(mockRpc).toHaveBeenCalledWith('admin_create_trip_bus', { p_name: 'Bus 2', p_trip_id: 20 });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('opens all names on person search, filters them and assigns the selected account', async () => {
    const users: AdminUserSummary[] = Array.from({ length: 12 }, (_, index) => ({
      user_id: `person-${index + 1}`, display_name: `Person ${index + 1}`,
      role: 'user', member_type: null, party_size: 1, emergency_on_duty: false,
      family_id: null, family_name: null, luggage_count: 0, sim_card_count: 0,
    }));
    await act(async () => { renderer = create(<AdminBusManagementPanel families={[]} users={users} />); });
    await act(async () => { choice('bus.admin.person').props.onPress(); });
    expect(() => choice('Person 1')).toThrow();
    const input = root().findAllByType(TextInput).find((field) => field.props.accessibilityLabel === 'bus.admin.personSearch')!;
    await act(async () => { input.props.onFocus(); });
    for (const user of users) expect(choice(user.display_name)).toBeDefined();
    await act(async () => { input.props.onChangeText('Person 12'); });
    expect(() => choice('Person 1')).toThrow();
    await act(async () => { choice('Person 12').props.onPress(); });
    expect(JSON.stringify(renderer?.toJSON())).toContain('bus.admin.selectedPerson Person 12');
    await act(async () => { choice('Bus 1').props.onPress(); });
    await act(async () => {
      root().findAllByType(Button).find((button) => button.props.label === 'bus.admin.saveAssignment')?.props.onPress();
    });
    expect(mockRpc).toHaveBeenCalledWith('admin_move_trip_person', { p_trip_id: 20, p_bus_id: 40, p_user_id: 'person-12' });
  });

  it.each(['family', 'group'] as const)('opens the full %s list and filters it before selecting', async (kind) => {
    const families: AccountFamily[] = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1, name: `Familie ${index + 1}`, created_at: '', updated_at: '', created_by_profile_id: null,
    }));
    const users: AdminUserSummary[] = families.map((family) => ({
      user_id: `member-${family.id}`, display_name: `Mitglied ${family.id}`, family_id: family.id,
      family_name: family.name, role: 'user', member_type: null, party_size: 1,
      emergency_on_duty: false, luggage_count: 0, sim_card_count: 0,
    }));
    mockGroups = families.map((family) => ({ ...initialMockGroups[0], id: family.id, name: `Gruppe ${family.id}` }));
    const names = kind === 'family' ? families.map((family) => family.name) : mockGroups.map((group) => group.name);
    await act(async () => { renderer = create(<AdminBusManagementPanel families={families} users={users} />); });
    await act(async () => { choice(`bus.admin.${kind}`).props.onPress(); });
    expect(() => choice(names[0])).toThrow();
    const input = root().findAllByType(TextInput).find((field) => field.props.accessibilityLabel === `bus.admin.${kind}Search`)!;
    await act(async () => { input.props.onFocus(); });
    for (const name of names) expect(choice(name)).toBeDefined();
    await act(async () => { input.props.onChangeText(names[11]); });
    expect(() => choice(names[0])).toThrow();
    await act(async () => { choice(names[11]).props.onPress(); });
    expect(JSON.stringify(renderer?.toJSON())).toContain(`bus.admin.selectedPerson ${names[11]}`);
    expect(() => choice(names[11])).toThrow();
  });

  it('requires confirmation to delete a saved arrangement and clears its selection', async () => {
    mockActiveTrip = null;
    mockTrips = [{
      id: 60, name: 'Gespeicherte Anordnung', archived_at: '2026-10-23T08:00:00Z',
      bus_setup_deleted_at: null, created_at: '2026-10-22T08:00:00Z', created_by_profile_id: 1,
    }];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await act(async () => { renderer = create(<AdminBusManagementPanel families={[]} users={[]} />); });
    await act(async () => { choice('Gespeicherte Anordnung').props.onPress(); });
    const deleteButton = root().findAllByType(Button).find((button) => button.props.label === 'bus.admin.deleteTemplate')!;
    await act(async () => { deleteButton.props.onPress(); });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(alert.mock.calls[0][0]).toContain('Gespeicherte Anordnung');
    const confirm = alert.mock.calls[0][2]?.find((button) => button.style === 'destructive');
    expect(confirm).toBeDefined();
    await act(async () => { confirm?.onPress?.(); });
    expect(mockRpc).toHaveBeenCalledWith('admin_delete_trip_bus_setup', { p_trip_id: 60 });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(() => choice('Gespeicherte Anordnung')).toThrow();
    expect(JSON.stringify(renderer?.toJSON())).toContain('bus.admin.templateDeleted');
    const tripName = root().findAllByType(TextInput).find((input) => input.props.accessibilityLabel === 'bus.admin.tripName')!;
    await act(async () => { tripName.props.onChangeText('Nächste Fahrt'); });
    await act(async () => { root().findAllByType(Button).find((button) => button.props.label === 'bus.admin.createTrip')?.props.onPress(); });
    expect(mockRpc).toHaveBeenLastCalledWith('admin_create_trip', { p_name: 'Nächste Fahrt' });
  });
});
