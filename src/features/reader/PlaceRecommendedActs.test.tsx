import { afterEach, beforeAll, expect, it, jest } from '@jest/globals';
import { ActivityIndicator, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PlaceRecommendedActs } from './PlaceRecommendedActs';

jest.mock('./imported-content-catalog', () => ({ useImportedContentCatalog: () => ({
  contents: [], isLoading: true, error: null, refresh: jest.fn(),
}) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ isRTL: false, t: (key: string) => key }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ surface: '#fff', text: '#111', border: '#777', accent: '#176' }) }));
jest.mock('@/constants/theme', () => ({ Fonts: { serif: 'serif' }, Spacing: { one: 4, two: 8, three: 16 } }));

let renderer: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { await act(async () => renderer?.unmount()); });

it('keeps existing recommended actions visible without a spinner while the catalog first loads', async () => {
  await act(async () => { renderer = create(<PlaceRecommendedActs placeId="place-test">
    <Text>Existing recommended action</Text>
  </PlaceRecommendedActs>); });
  expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  expect(renderer.root.findAllByType(Text).some((node) => node.props.children === 'Existing recommended action')).toBe(true);
});

it('shows initial progress when neither imported nor bundled actions are available yet', async () => {
  await act(async () => { renderer = create(<PlaceRecommendedActs placeId="place-test" />); });
  expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);
});
