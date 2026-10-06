import { describe, expect, it } from '@jest/globals';

import {
  canAccessNonBlockingRoutes,
  getLoginScreenDecision,
  getProtectedRouteDecision,
} from '@/features/auth/protected-route-policy';
import {
  busRoute,
  dailyProgramRoute,
  guideRoute,
  getProtectedReturnRoute,
  groupRoute,
  loginRoute,
  onboardingRoute,
  protectedRoutePaths,
} from '@/features/navigation/routes';

describe('protected navigation', () => {
  it('leitet Gäste geschützter Screens gezielt zum Login', () => {
    expect(
      getProtectedRouteDecision({
        admin: false,
        hasSession: false,
        isAdmin: false,
        isLoading: false,
      }),
    ).toBe('login');
    expect(loginRoute('/account')).toEqual({
      params: { returnTo: '/account' },
      pathname: '/login',
    });
  });

  it('erlaubt geschützte Inhalte nur mit passender Session und Rolle', () => {
    expect(
      getProtectedRouteDecision({
        admin: false,
        hasSession: true,
        isAdmin: false,
        isLoading: false,
      }),
    ).toBe('allow');
    expect(
      getProtectedRouteDecision({
        admin: true,
        hasSession: true,
        isAdmin: false,
        isLoading: false,
      }),
    ).toBe('unauthorized');
  });

  it('akzeptiert nur bekannte interne Rücksprungziele', () => {
    for (const route of protectedRoutePaths) {
      expect(getProtectedReturnRoute(route)).toBe(route);
    }

    expect(getProtectedReturnRoute('https://example.com')).toBe('/');
    expect(getProtectedReturnRoute('//example.com')).toBe('/');
  });

  it('führt den einmaligen Einstieg als eigene öffentliche Route', () => {
    expect(onboardingRoute()).toBe('/onboarding');
  });

  it('hält den nativen Login-Übergang stabil, bis Auth und Pflichtabfrage geklärt sind', () => {
    expect(
      getLoginScreenDecision({
        hasProfileError: false,
        hasSession: true,
        isAdmin: false,
        isAuthLoading: true,
        isGroupCheckBlocking: false,
        isGroupCheckLoading: true,
      }),
    ).toBe('loading');
    expect(
      canAccessNonBlockingRoutes({
        hasProfileError: false,
        hasSession: true,
        isAuthLoading: true,
        isGroupCheckBlocking: false,
      }),
    ).toBe(false);

    expect(
      getLoginScreenDecision({
        hasProfileError: false,
        hasSession: true,
        isAdmin: false,
        isAuthLoading: false,
        isGroupCheckBlocking: true,
        isGroupCheckLoading: true,
      }),
    ).toBe('loading');
    expect(
      canAccessNonBlockingRoutes({
        hasProfileError: false,
        hasSession: true,
        isAuthLoading: false,
        isGroupCheckBlocking: true,
      }),
    ).toBe(false);

    expect(
      getLoginScreenDecision({
        hasProfileError: false,
        hasSession: true,
        isAdmin: false,
        isAuthLoading: false,
        isGroupCheckBlocking: false,
        isGroupCheckLoading: false,
      }),
    ).toBe('return');
    expect(
      canAccessNonBlockingRoutes({
        hasProfileError: false,
        hasSession: true,
        isAuthLoading: false,
        isGroupCheckBlocking: false,
      }),
    ).toBe(true);
  });

  it('führt bei einem Profil- oder Pflichtabfragefehler weiter zum Check-in', () => {
    expect(
      getLoginScreenDecision({
        hasProfileError: true,
        hasSession: true,
        isAdmin: false,
        isAuthLoading: false,
        isGroupCheckBlocking: false,
        isGroupCheckLoading: true,
      }),
    ).toBe('check-in');
    expect(
      canAccessNonBlockingRoutes({
        hasProfileError: true,
        hasSession: true,
        isAuthLoading: false,
        isGroupCheckBlocking: false,
      }),
    ).toBe(false);
  });

  it('führt das Busmanagement als geschützte interne Route', () => {
    expect(busRoute()).toBe('/bus');
    expect(protectedRoutePaths).toContain('/bus');
    expect(loginRoute(busRoute())).toEqual({
      params: { returnTo: '/bus' },
      pathname: '/login',
    });
  });

  it('führt die Reiseführung als geschützte interne Route', () => {
    expect(guideRoute()).toBe('/guide');
    expect(protectedRoutePaths).toContain('/guide');
    expect(loginRoute(guideRoute())).toEqual({
      params: { returnTo: '/guide' },
      pathname: '/login',
    });
  });

  it('führt die Reisegruppe als geschützte interne Route', () => {
    expect(groupRoute()).toBe('/group');
    expect(protectedRoutePaths).toContain('/group');
    expect(loginRoute(groupRoute())).toEqual({
      params: { returnTo: '/group' },
      pathname: '/login',
    });
  });

  it('führt das Wochenprogramm als geschützte interne Route', () => {
    expect(dailyProgramRoute()).toBe('/program');
    expect(protectedRoutePaths).toContain('/program');
    expect(loginRoute(dailyProgramRoute())).toEqual({
      params: { returnTo: '/program' },
      pathname: '/login',
    });
  });
});
