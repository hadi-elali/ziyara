import { describe, expect, it, jest } from '@jest/globals';
import { getRootStackRouteNames } from 'expo-router/build/global-state/utils';
import { getRoutes } from 'expo-router/build/getRoutes';
import type { RequireContext } from 'expo-router/build/types';

import appConfig from '../../../app.json';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: jest.requireActual<typeof import('../../../app.json')>('../../../app.json').expo },
}));

describe('Expo Router system entry points', () => {
  it('disables system screens mounted above the authenticated app layout', () => {
    // These screens live outside RootLayout; Stack.Protected cannot guard them.
    expect(getRootStackRouteNames()).toEqual(['__root']);
  });

  it('resolves unmatched links through the app route without a generated sitemap', () => {
    const routeModule = { default: () => null };
    const context: RequireContext = Object.assign(() => routeModule, {
      keys: () => ['./_layout.tsx', './login.tsx', './+not-found.tsx'],
      resolve: (key: string) => key,
      id: 'system-route-regression',
    });
    const routes = getRoutes(context, { ...appConfig.expo.extra.router, ignoreEntryPoints: true });
    expect(routes?.children.map((route) => route.route).sort()).toEqual(['+not-found', 'login']);
    expect(routes?.children.find((route) => route.route === '+not-found')?.generated).not.toBe(true);
  });
});
