import { describe, expect, it } from '@jest/globals';

import { isStartupNavigationPending, isStartupRouteReady } from '@/features/navigation/startup-state';

const restoredAccount = {
  hasActiveCheck: false,
  hasCompletedOnboarding: true,
  hasGroupCheckError: false,
  hasProfileError: false,
  hasSession: true,
  isAdmin: false,
  isAuthLoading: false,
  isGroupCheckBlocking: false,
  isGroupCheckLoading: false,
  pathname: '/',
};

describe('startup navigation', () => {
  it('hält Auth- und initiales Gruppencheck-Laden aus der Statusabfrage heraus', () => {
    expect(isStartupNavigationPending({ ...restoredAccount, hasSession: false, isAuthLoading: true })).toBe(true);
    expect(isStartupNavigationPending({ ...restoredAccount, isGroupCheckLoading: true })).toBe(true);
    expect(isStartupNavigationPending(restoredAccount)).toBe(false);
    expect(isStartupNavigationPending({ ...restoredAccount, hasProfileError: true, isGroupCheckLoading: true })).toBe(false);
    expect(isStartupNavigationPending({ ...restoredAccount, isAdmin: true, isGroupCheckLoading: true })).toBe(false);
    expect(isStartupRouteReady({ ...restoredAccount, pathname: '/startup' })).toBe(false);
  });

  it('hält einen Kaltstart bis nach der Check-in-Weiterleitung hinter dem Splash', () => {
    const stages = [
      { ...restoredAccount, hasSession: false, isAuthLoading: true },
      { ...restoredAccount, pathname: '/check-in', isAuthLoading: true },
      { ...restoredAccount, pathname: '/check-in', isGroupCheckLoading: true, isGroupCheckBlocking: true },
      { ...restoredAccount, pathname: '/check-in' },
      restoredAccount,
    ];
    expect(stages.map(isStartupRouteReady)).toEqual([false, false, false, false, true]);
  });

  it('zeigt eine echte Pflichtabfrage erst auf ihrem Zielscreen', () => {
    const blocking = { ...restoredAccount, hasActiveCheck: true, isGroupCheckBlocking: true };
    expect(isStartupRouteReady(blocking)).toBe(false);
    expect(isStartupRouteReady({ ...blocking, pathname: '/check-in' })).toBe(true);
  });

  it('gibt Profil- und Synchronisationsfehler sichtbar zur Wiederholung frei', () => {
    expect(isStartupRouteReady({ ...restoredAccount, hasProfileError: true })).toBe(false);
    expect(isStartupRouteReady({
      ...restoredAccount, pathname: '/check-in', hasProfileError: true, isGroupCheckLoading: true,
    })).toBe(true);
    expect(isStartupRouteReady({
      ...restoredAccount, pathname: '/check-in', hasGroupCheckError: true,
    })).toBe(true);
  });

  it('lässt Notfalllinks und Push-Ziele während des initialen Gruppenchecks öffnen', () => {
    for (const pathname of ['/emergency', '/emergency-dashboard']) {
      expect(isStartupRouteReady({
        ...restoredAccount, pathname, isGroupCheckLoading: true, isGroupCheckBlocking: true,
      })).toBe(true);
      expect(isStartupRouteReady({ ...restoredAccount, pathname, isAuthLoading: true })).toBe(false);
    }
  });

  it('zeigt Erststart und Passwortlinks unabhängig von privaten Serverabfragen', () => {
    for (const pathname of ['/onboarding', '/forgot-password', '/reset-password']) {
      expect(isStartupRouteReady({ ...restoredAccount, pathname, isAuthLoading: true })).toBe(true);
    }
    expect(isStartupRouteReady({
      ...restoredAccount, hasSession: false, hasCompletedOnboarding: false,
    })).toBe(false);
  });

  it('öffnet den Gastguide und Admin-Home ohne Gruppencheck-Abfrage', () => {
    expect(isStartupRouteReady({ ...restoredAccount, hasSession: false, isGroupCheckLoading: true })).toBe(true);
    expect(isStartupRouteReady({ ...restoredAccount, isAdmin: true, isGroupCheckLoading: true })).toBe(true);
  });

  it('verbirgt automatische Auth-Weiterleitungen und zeigt Gästen das Formular', () => {
    for (const pathname of ['/login', '/register']) {
      expect(isStartupRouteReady({ ...restoredAccount, pathname })).toBe(false);
      expect(isStartupRouteReady({ ...restoredAccount, pathname, hasSession: false })).toBe(true);
    }
    expect(isStartupRouteReady({ ...restoredAccount, pathname: '/check-in', hasSession: false })).toBe(false);
  });
});
