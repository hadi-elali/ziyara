/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#14201A',
    background: '#F2F2F2',
    surface: '#FFFFFF',
    backgroundElement: '#C8E6C9',
    backgroundSelected: '#D8E5DE',
    textSecondary: '#5B6861',
    border: '#CAD7D0',
    accent: '#1F7A5A',
    accentSoft: '#DDEFE7',
    location: '#2563EB',
    warning: '#A9792B',
    warningSoft: '#F4E8D3',
    success: '#2A7A43',
    successSoft: '#DDEEDC',
    danger: '#B14B45',
    dangerSoft: '#F4DDDA',
  },
  dark: {
    text: '#F4F8FF',
    background: '#242C40',
    surface: '#34495E',
    backgroundElement: '#1B2B44',
    backgroundSelected: '#223754',
    textSecondary: '#B8C7DA',
    border: '#2C405F',
    accent: '#7CC7B2',
    accentSoft: '#173A46',
    location: '#60A5FA',
    warning: '#E2BE6A',
    warningSoft: '#372B16',
    success: '#86DAA0',
    successSoft: '#173927',
    danger: '#F19A91',
    dangerSoft: '#3E2223',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MediaBackdrop = {
  border: 'rgba(255, 255, 255, 0.34)',
  scrim: 'rgba(0, 0, 0, 0.48)',
  surface: 'rgba(20, 32, 26, 0.78)',
  text: '#F4F8FF',
  textSecondary: '#DDE8E1',
} as const;

export const OnboardingPalette = {
  background: '#032D26',
  border: 'rgba(244, 248, 255, 0.7)',
  brandGreen: '#5F8F6B',
  gold: '#F0CC82',
  goldPressed: '#DDB769',
  overlay: 'rgba(0, 0, 0, 0.28)',
  text: '#FFF9ED',
  textSecondary: '#F1E8D9',
  videoBackground: '#000000',
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
