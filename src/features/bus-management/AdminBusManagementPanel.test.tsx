import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { AdminBusManagementPanel } from '@/features/bus-management/AdminBusManagementPanel';
import { buildTripGroupStates } from '@/features/trip-groups/trip-group-state';

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ error: { message: string } | null }>>();
const mockRefresh = jest.fn(async () => {});
const mockRefreshGroups = jest.fn(async () => {});
let mockGroupError = false;
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
    activeTrip: { id: 20, name: 'Testfahrt' },
    buses: [{ id: 40, name: 'Bus 1', leader_participant_id: null }],
    participants: [], trips: [], hasSyncError: false, isLoading: false, refresh: mockRefresh,
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
    mockGroups = initialMockGroups;
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); renderer = null; });
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
    expect(choice('Gruppe A').props.accessibilityState.checked).toBe(true);
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
});
