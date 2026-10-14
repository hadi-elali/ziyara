import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { RequireAuth } from '@/features/auth/RequireAuth';
import type { AppRole } from '@/domain/database';
import { questionRoundManagerRoles } from '@/features/question-round/question-round-permissions';

const mockAuthState = {
  isAdmin: false,
  isLoading: false,
  session: null as { user: { id: string } } | null,
  profile: null as { role: AppRole } | null,
};

jest.mock('expo-router', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Redirect: ({ href }: { href: unknown }) => (
      <MockView accessibilityLabel={JSON.stringify(href)} testID="redirect" />
    ),
  };
});

jest.mock('@/components/ui/screen', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Screen: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>,
  };
});

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ accent: '#000000' }),
}));

const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null;

function getRenderer() {
  if (!renderer) {
    throw new Error('Der Route-Guard wurde noch nicht gerendert.');
  }

  return renderer;
}

describe('RequireAuth route guard', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    renderer = null;
    mockAuthState.isAdmin = false;
    mockAuthState.isLoading = false;
    mockAuthState.session = null;
    mockAuthState.profile = null;
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer?.unmount());
    }
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('zeigt beim initialen Auth-Laden einen stabilen Ladezustand', async () => {
    mockAuthState.isLoading = true;
    await act(async () => {
      renderer = create(
        <RequireAuth returnTo="/account">
          <Text>Account</Text>
        </RequireAuth>,
      );
    });

    expect(getRenderer().root.findAllByProps({ testID: 'redirect' })).toHaveLength(0);
    expect(getRenderer().root.findAllByType(Text)).toHaveLength(0);
  });

  it('leitet Gäste mit sicherem Rücksprungziel zum Login', async () => {
    await act(async () => {
      renderer = create(
        <RequireAuth returnTo="/question-round">
          <Text>Fragerunde</Text>
        </RequireAuth>,
      );
    });

    expect(
      JSON.parse(getRenderer().root.findByProps({ testID: 'redirect' }).props.accessibilityLabel),
    ).toEqual({ params: { returnTo: '/question-round' }, pathname: '/login' });
  });

  it('verweigert normalen Nutzern Admin-Routen', async () => {
    mockAuthState.session = { user: { id: 'user-a' } };
    await act(async () => {
      renderer = create(
        <RequireAuth admin returnTo="/admin">
          <Text>Administration</Text>
        </RequireAuth>,
      );
    });

    expect(getRenderer().root.findByProps({ testID: 'redirect' }).props.accessibilityLabel).toBe(
      JSON.stringify('/'),
    );
  });

  it('rendert geschützte Inhalte nur bei passender Session und Rolle', async () => {
    mockAuthState.isAdmin = true;
    mockAuthState.session = { user: { id: 'admin-a' } };
    await act(async () => {
      renderer = create(
        <RequireAuth admin returnTo="/admin">
          <Text>Administration</Text>
        </RequireAuth>,
      );
    });

    expect(getRenderer().root.findByType(Text).props.children).toBe('Administration');
  });

  it.each(['admin', 'scholar'] as const)('erlaubt %s die Fragerundenverwaltung', async (role) => {
    mockAuthState.session = { user: { id: 'manager-a' } };
    mockAuthState.profile = { role };
    mockAuthState.isAdmin = role === 'admin';
    await act(async () => {
      renderer = create(
        <RequireAuth roles={questionRoundManagerRoles} returnTo="/question-round-management">
          <Text>Fragerundenverwaltung</Text>
        </RequireAuth>,
      );
    });

    expect(getRenderer().root.findByType(Text).props.children).toBe('Fragerundenverwaltung');
  });

  it.each(['user', 'medical_staff', 'organization_team', null] as const)(
    'verweigert %s die Fragerundenverwaltung',
    async (role) => {
      mockAuthState.session = { user: { id: 'user-a' } };
      mockAuthState.profile = role ? { role } : null;
      await act(async () => {
        renderer = create(
          <RequireAuth roles={questionRoundManagerRoles} returnTo="/question-round-management">
            <Text>Fragerundenverwaltung</Text>
          </RequireAuth>,
        );
      });

      expect(getRenderer().root.findByProps({ testID: 'redirect' }).props.accessibilityLabel).toBe(
        JSON.stringify('/'),
      );
      expect(getRenderer().root.findAllByType(Text)).toHaveLength(0);
    },
  );

  it('entfernt den Zugang sofort bei einem Rollenwechsel und behält Adminrouten gesperrt', async () => {
    mockAuthState.session = { user: { id: 'scholar-a' } };
    mockAuthState.profile = { role: 'scholar' };
    const content = () => (
      <RequireAuth roles={questionRoundManagerRoles} returnTo="/question-round-management">
        <Text>Fragerundenverwaltung</Text>
      </RequireAuth>
    );
    await act(async () => { renderer = create(content()); });
    expect(getRenderer().root.findAllByType(Text)).toHaveLength(1);

    mockAuthState.profile = { role: 'user' };
    await act(async () => { getRenderer().update(content()); });
    expect(getRenderer().root.findAllByType(Text)).toHaveLength(0);

    mockAuthState.profile = { role: 'scholar' };
    await act(async () => {
      getRenderer().update(<RequireAuth admin returnTo="/admin"><Text>Admin</Text></RequireAuth>);
    });
    expect(getRenderer().root.findByProps({ testID: 'redirect' }).props.accessibilityLabel).toBe(
      JSON.stringify('/'),
    );
  });
});
