import type { Href } from 'expo-router';

export const protectedRoutePaths = [
  '/account',
  '/alarm',
  '/admin',
  '/bus',
  '/emergency',
  '/emergency-dashboard',
  '/group',
  '/guide',
  '/program',
  '/check-in',
  '/question-round',
] as const;

export type ProtectedRoutePath = (typeof protectedRoutePaths)[number];

function routeSegment(value: string) {
  return encodeURIComponent(value);
}

export function singleRouteParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function cityRoute(city: string): Href {
  return `/city/${routeSegment(city)}` as Href;
}

export function placeRoute(slug: string): Href {
  return `/place/${routeSegment(slug)}` as Href;
}

export function readerRoute(slug: string): Href {
  return `/reader/${routeSegment(slug)}` as Href;
}

export function getProtectedReturnRoute(value?: string | string[]): ProtectedRoutePath | '/' {
  const route = singleRouteParam(value);

  return protectedRoutePaths.find((candidate) => candidate === route) ?? '/';
}

export function loginRoute(returnTo?: ProtectedRoutePath): Href {
  return returnTo
    ? ({ pathname: '/login', params: { returnTo } } as Href)
    : ('/login' as Href);
}

export function registerRoute(returnTo?: ProtectedRoutePath): Href {
  return returnTo
    ? ({ pathname: '/register', params: { returnTo } } as Href)
    : ('/register' as Href);
}

export function forgotPasswordRoute(): Href {
  return '/forgot-password' as Href;
}

export function resetPasswordRoute(): Href {
  return '/reset-password' as Href;
}

export function onboardingRoute(): Href {
  return '/onboarding' as Href;
}

export function busRoute(): Href & ProtectedRoutePath {
  return '/bus' as Href & ProtectedRoutePath;
}

export function emergencyRoute(): Href & ProtectedRoutePath {
  return '/emergency' as Href & ProtectedRoutePath;
}

export function emergencyDashboardRoute(): Href & ProtectedRoutePath {
  return '/emergency-dashboard' as Href & ProtectedRoutePath;
}

export function guideRoute(): Href & ProtectedRoutePath {
  return '/guide' as Href & ProtectedRoutePath;
}

export function groupRoute(): Href & ProtectedRoutePath {
  return '/group' as Href & ProtectedRoutePath;
}

export function dailyProgramRoute(): Href & ProtectedRoutePath {
  return '/program' as Href & ProtectedRoutePath;
}

export function checkInRoute(returnTo: ProtectedRoutePath | '/' = '/'): Href {
  return returnTo === '/'
    ? ('/check-in' as Href)
    : ({ pathname: '/check-in', params: { returnTo } } as Href);
}

export function alarmRoute(): Href & ProtectedRoutePath {
  return '/alarm' as Href & ProtectedRoutePath;
}
