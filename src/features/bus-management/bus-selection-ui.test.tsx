import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '@/components/ui/button';
import type { AdminTripBusMember, TripBus } from '@/domain/database';
import { AdminBusRoster } from '@/features/bus-management/AdminBusRoster';
import { BusSelectionPanel } from '@/features/bus-management/BusSelectionPanel';

const mockSelectBus = jest.fn<(busId: number) => Promise<void>>();
const mockSetBusPresence = jest.fn<(busId: number, isOnBus: boolean) => Promise<void>>();
const buses: TripBus[] = [1, 2].map((id) => ({
  id, name: `Bus ${id}`, trip_id: 10, sort_order: id, leader_participant_id: null, created_at: '',
}));
const mockState = {
  activeTrip: { id: 10 } as { id: number } | null,
  buses,
  participants: [] as { profile_id: number; bus_id: number; is_on_bus?: boolean | null }[],
  selectBus: mockSelectBus,
  setBusPresence: mockSetBusPresence,
};

jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ profile: { id: 7 } }) }));
jest.mock('@/features/bus-management/bus-management-context', () => ({ useBusManagement: () => mockState }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({
  t: (key: string, params?: Record<string, string | number>) => params ? `${key} ${Object.values(params).join(' ')}` : key,
}) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#127456' }) }));
jest.mock('@/constants/theme', () => ({ Spacing: { half: 2, one: 4, two: 8, three: 16 } }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'Text' }));
jest.mock('@/components/ui/card', () => ({ Card: 'View' }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null = null;
function root() {
  if (!renderer) throw new Error('UI not mounted');
  return renderer.root;
}
function button(label: string) {
  const found = root().findAllByType(Button).find((node) => node.props.label === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}
function visibleText() { return JSON.stringify(renderer?.toJSON()); }

describe('self-service bus selection and admin roster', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    mockState.activeTrip = { id: 10 };
    mockState.buses = buses;
    mockState.participants = [];
    mockSelectBus.mockReset().mockResolvedValue(undefined);
    mockSetBusPresence.mockReset().mockResolvedValue(undefined);
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); renderer = null; });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

  it('lets an unassigned account select a bus and confirms the saved choice', async () => {
    await act(async () => { renderer = create(<BusSelectionPanel />); });
    expect(visibleText()).toContain('bus.selection.title');
    await act(async () => { button('bus.selection.choose Bus 2').props.onPress(); });
    expect(mockSelectBus).toHaveBeenCalledWith(2);
    expect(visibleText()).toContain('bus.selection.saved');
  });

  it('shows only the current account assignment and supports changing it', async () => {
    mockState.participants = [{ profile_id: 99, bus_id: 2 }, { profile_id: 7, bus_id: 1 }];
    await act(async () => { renderer = create(<BusSelectionPanel />); });
    expect(button('bus.selection.selected Bus 1').props.disabled).toBe(true);
    await act(async () => { button('bus.selection.change Bus 2').props.onPress(); });
    expect(mockSelectBus).toHaveBeenCalledWith(2);
    expect(mockSelectBus).toHaveBeenCalledTimes(1);
  });

  it('prevents concurrent choices while saving and keeps failures actionable', async () => {
    let rejectSave: (error: Error) => void = () => {};
    mockSelectBus.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSave = reject; }));
    await act(async () => { renderer = create(<BusSelectionPanel />); });
    await act(async () => {
      button('bus.selection.choose Bus 1').props.onPress();
      button('bus.selection.choose Bus 2').props.onPress();
    });
    expect(mockSelectBus).toHaveBeenCalledTimes(1);
    expect(button('bus.selection.choose Bus 2').props.disabled).toBe(true);
    await act(async () => { rejectSave(new Error('Failed to fetch')); });
    expect(visibleText()).toContain('bus.submitError.offline');
    expect(visibleText()).not.toContain('bus.selection.saved');
    expect(button('bus.selection.choose Bus 2').props.disabled).toBe(false);
  });

  it('explains a trip that ended during selection', async () => {
    mockSelectBus.mockRejectedValueOnce(new Error('Active trip not found.'));
    await act(async () => { renderer = create(<BusSelectionPanel />); });
    await act(async () => { button('bus.selection.choose Bus 1').props.onPress(); });
    expect(visibleText()).toContain('bus.selection.changed');
  });

  it('lets the current account confirm and revise its presence without claiming success on failure', async () => {
    mockState.participants = [{ profile_id: 7, bus_id: 1, is_on_bus: null }];
    await act(async () => { renderer = create(<BusSelectionPanel />); });
    expect(visibleText()).toContain('bus.presence.unanswered');
    await act(async () => { button('bus.presence.onBus').props.onPress(); });
    expect(mockSetBusPresence).toHaveBeenCalledWith(1, true);
    expect(visibleText()).toContain('bus.presence.saved');
    mockState.participants = [{ profile_id: 7, bus_id: 1, is_on_bus: true }];
    await act(async () => { renderer?.update(<BusSelectionPanel />); });
    expect(button('bus.presence.onBus').props.disabled).toBe(false);
    mockSetBusPresence.mockRejectedValueOnce(new Error('Failed to fetch'));
    await act(async () => { button('bus.presence.notOnBus').props.onPress(); });
    expect(mockSetBusPresence).toHaveBeenLastCalledWith(1, false);
    expect(visibleText()).toContain('bus.submitError.offline');
    expect(visibleText()).not.toContain('bus.presence.saved');
    expect(button('bus.presence.onBus').props.accessibilityState.selected).toBe(true);
  });

  it('has separate empty states for no active trip and no buses', async () => {
    mockState.activeTrip = null;
    await act(async () => { renderer = create(<BusSelectionPanel />); });
    expect(visibleText()).toContain('bus.selection.noTripTitle');
    mockState.activeTrip = { id: 10 };
    mockState.buses = [];
    await act(async () => { renderer?.update(<BusSelectionPanel />); });
    expect(visibleText()).toContain('bus.selection.noBuses');
    expect(root().findAllByType(Button)).toHaveLength(0);
  });

  it('starts with collapsed names, includes unassigned users and moves exactly one account', async () => {
    const roster: AdminTripBusMember[] = [
      { user_id: 'assigned', display_name: 'Assigned person', bus_id: 1, participant_id: 30, is_on_bus: null },
      { user_id: 'unassigned', display_name: 'Unassigned person', bus_id: null, participant_id: null, is_on_bus: null },
    ];
    const onMove = jest.fn();
    await act(async () => { renderer = create(<AdminBusRoster buses={buses} roster={roster} disabled={false} onMove={onMove} />); });
    expect(visibleText()).not.toContain('Assigned person');
    expect(visibleText()).not.toContain('Unassigned person');
    function section(label: string) {
      return root().findAll((node) => node.props.accessibilityRole === 'button')
        .find((node) => node.props.accessibilityLabel === label)!;
    }
    await act(async () => { section('bus.admin.rosterSection Bus 1 1').props.onPress(); });
    expect(visibleText()).toContain('Assigned person');
    await act(async () => { button('bus.admin.movePerson Assigned person').props.onPress(); });
    await act(async () => { button('bus.admin.moveTo Bus 2').props.onPress(); });
    expect(onMove).toHaveBeenCalledWith('assigned', 2);
    await act(async () => { section('bus.admin.rosterSection Bus 1 1').props.onPress(); });
    expect(visibleText()).not.toContain('Assigned person');
    await act(async () => { section('bus.admin.rosterSection bus.admin.unassigned 1').props.onPress(); });
    expect(visibleText()).toContain('Unassigned person');
  });
});
