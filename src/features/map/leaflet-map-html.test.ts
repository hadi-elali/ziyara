import { describe, expect, it, jest } from '@jest/globals';
import { runInNewContext } from 'node:vm';

import {
  createLeafletFocusScript,
  createLeafletMapHtml,
  createLeafletMapUpdateScript,
  type LeafletFocusRequest,
  type LeafletMapConfiguration,
  type LeafletMapData,
} from './leaflet-map-html';

const configuration: LeafletMapConfiguration = {
  accessibilityLabel: 'Irak-Karte',
  backgroundColor: '#f2efe9',
  borderColor: '#d0d0d0',
  center: { latitude: 33.1, longitude: 43.9 },
  interactive: true,
  interactiveSelection: false,
  maxBounds: {
    maxLatitude: 37.5,
    maxLongitude: 48.8,
    minLatitude: 29,
    minLongitude: 38.8,
  },
  maxZoom: 18,
  minZoom: 5,
  surfaceColor: '#ffffff',
  textColor: '#111111',
  tileErrorMessage: 'Karte derzeit nicht verfügbar.',
  zoom: 5,
  zoomInLabel: 'Vergrößern',
  zoomOutLabel: 'Verkleinern',
};

const data: LeafletMapData = {
  points: [
    {
      accessibilityLabel: 'Nadschaf',
      color: '#a00000',
      coordinate: { latitude: 32, longitude: 44.33 },
      id: 'najaf',
      title: 'Nadschaf',
    },
  ],
  selectedColor: '#b14b45',
  selectedCoordinate: null,
};

function createMapRuntime() {
  const emptyData: LeafletMapData = { ...data, points: [] };
  const html = createLeafletMapHtml(configuration, emptyData);
  const script = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  const map = { invalidateSize: jest.fn(), setView: jest.fn().mockReturnThis() };
  const layer = {
    addTo: jest.fn().mockReturnThis(),
    clearLayers: jest.fn(),
    on: jest.fn().mockReturnThis(),
  };
  const element = { setAttribute: jest.fn(), style: { setProperty: jest.fn() } };
  const bridgeWindow = {} as {
    __ZIYARA_MAP__: {
      focus: (request: LeafletFocusRequest | null) => void;
      update: (nextData: LeafletMapData) => void;
    };
  };

  runInNewContext(script, {
    L: {
      control: {
        attribution: () => ({ addTo() { return this; }, getContainer: () => null }),
        zoom: () => ({ addTo: jest.fn() }),
      },
      latLngBounds: jest.fn(),
      layerGroup: () => layer,
      map: () => map,
      tileLayer: () => layer,
    },
    ResizeObserver: class { observe() {} },
    document: { documentElement: element, getElementById: () => element },
    window: bridgeWindow,
  });

  return { bridge: bridgeWindow.__ZIYARA_MAP__, emptyData, map };
}

describe('Leaflet WebView HTML', () => {
  it('bundles Leaflet locally and only references OSM for map tiles', () => {
    const html = createLeafletMapHtml(configuration, data);

    expect(html).toContain('Leaflet 1.9.4');
    expect(html).toContain('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(html).not.toContain('unpkg.com');
    expect(html).not.toContain('$$EXPO_DOM');
  });

  it('escapes native data before inserting it into scripts', () => {
    const hostileData: LeafletMapData = {
      ...data,
      points: [{ ...data.points[0], title: '</script><script>alert(1)</script>' }],
    };

    const html = createLeafletMapHtml(configuration, hostileData);
    const updateScript = createLeafletMapUpdateScript(hostileData);

    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(updateScript).not.toContain('</script>');
    expect(updateScript).toContain('\\u003c/script\\u003e');
  });

  it('creates an inert focus command for a missing target', () => {
    expect(createLeafletFocusScript()).toBe(
      'window.__ZIYARA_MAP__?.focus(null); true;',
    );
  });

  it('preserves a manual zoom when the last destination focus is synchronized again', () => {
    const { bridge, emptyData, map } = createMapRuntime();
    const destination = { key: 'destination:1', latitude: 32.6, longitude: 44, zoom: 12 };
    bridge.focus(destination);
    map.setView.mockClear();

    map.setView([32.6, 44], 11.75);
    bridge.update(emptyData);
    bridge.focus({ ...destination });
    bridge.focus(null);

    expect(map.setView).toHaveBeenCalledTimes(1);
    expect(map.setView).toHaveBeenLastCalledWith([32.6, 44], 11.75);
  });

  it('allows another explicit focus on the same destination and a return to overview', () => {
    const { bridge, map } = createMapRuntime();
    bridge.focus({ key: 'destination:1', latitude: 32.6, longitude: 44, zoom: 12 });
    map.setView.mockClear();

    bridge.focus({ key: 'destination:2', latitude: 32.6, longitude: 44, zoom: 12 });
    bridge.focus({ key: 'overview:3', ...configuration.center, zoom: 6 });

    expect(map.setView).toHaveBeenCalledTimes(2);
    expect(map.setView).toHaveBeenLastCalledWith([33.1, 43.9], 6, { animate: true });
  });
});
