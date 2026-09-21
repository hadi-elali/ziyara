import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AdminTravelOrganizationPanel } from '@/features/admin/AdminTravelOrganizationPanel';

const mockBusState = {
  activeBoarding: null,
  activeTrip: {
    archived_at: null,
    created_at: '2026-09-21T10:00:00.000Z',
    created_by_profile_id: 1,
    id: 7,
    name: 'Ziyara 2026',
  },
  buses: [{ id: 1 }, { id: 2 }],
  participants: [{ id: 10 }, { id: 11 }, { id: 12 }],
};

jest.mock('@/components/themed-text', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    ThemedText: ({ children }: { children: React.ReactNode }) => (
      <MockText>{children}</MockText>
    ),
  };
});

jest.mock('@/components/ui/card', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Card: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>,
  };
});

jest.mock('@/components/ui/symbol-icon', () => ({
  SymbolIcon: () => null,
}));

jest.mock('@/constants/theme', () => ({
  Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24 },
}));

jest.mock('@/features/bus-management/AdminBusManagementPanel', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');

  return { AdminBusManagementPanel: () => <MockText>bus-panel</MockText> };
});

jest.mock('@/features/general-alarm/AdminGeneralAlarmPanel', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');

  return { AdminGeneralAlarmPanel: () => <MockText>alarm-panel</MockText> };
});

jest.mock('@/features/trip-guidance/AdminTripGuidancePanel', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');

  return { AdminTripGuidancePanel: () => <MockText>guidance-panel</MockText> };
});

jest.mock('@/features/trip-groups/AdminTripGroupPanel', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');

  return { AdminTripGroupPanel: () => <MockText>groups-panel</MockText> };
});

jest.mock('@/features/bus-management/bus-management-context', () => ({
  useBusManagement: () => mockBusState,
}));

jest.mock('@/features/trip-groups/trip-group-context', () => ({
  useTripGroups: () => ({ groups: [{ id: 20 }] }),
}));

jest.mock('@/features/trip-guidance/trip-guidance-context', () => ({
  useTripGuidance: () => ({ activeGuidance: { id: 30 } }),
}));

jest.mock('@/features/i18n/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    accent: '#1f7a5a',
    background: '#f2f2f2',
    backgroundElement: '#c8e6c9',
    border: '#cad7d0',
    surface: '#ffffff',
    text: '#14201a',
    textSecondary: '#5b6861',
  }),
}));

const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null;

function getRenderer() {
  if (!renderer) throw new Error('Die Reiseorganisation wurde noch nicht gerendert.');
  return renderer;
}

function visibleText() {
  return getRenderer()
    .root.findAllByType(Text)
    .flatMap((node) => node.props.children)
    .join(' ');
}

describe('AdminTravelOrganizationPanel', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    renderer = null;
  });

  afterEach(async () => {
    if (renderer) await act(async () => renderer?.unmount());
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('zeigt die gemeinsame Reiseübersicht und startet mit Reise & Busse', async () => {
    await act(async () => {
      renderer = create(<AdminTravelOrganizationPanel families={[]} users={[]} />);
    });

    expect(visibleText()).toContain('Ziyara 2026');
    expect(visibleText()).toContain('bus-panel');
    expect(visibleText()).not.toContain('groups-panel');
    expect(visibleText()).not.toContain('guidance-panel');
  });

  it('wechselt zwischen Gruppen und der kombinierten Live-Begleitung', async () => {
    await act(async () => {
      renderer = create(<AdminTravelOrganizationPanel families={[]} users={[]} />);
    });

    const tabs = getRenderer()
      .root.findAllByProps({ accessibilityRole: 'radio' })
      .filter((node) => typeof node.props.style === 'function');
    expect(tabs).toHaveLength(3);

    await act(async () => tabs[1].props.onPress());
    expect(visibleText()).toContain('groups-panel');
    expect(visibleText()).not.toContain('bus-panel');

    await act(async () => tabs[2].props.onPress());
    expect(visibleText()).toContain('guidance-panel');
    expect(visibleText()).toContain('alarm-panel');
    expect(tabs[2].props.accessibilityState.checked).toBe(true);
  });
});
