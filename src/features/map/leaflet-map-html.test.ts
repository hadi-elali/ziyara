import { describe, expect, it } from '@jest/globals';

import {
  createLeafletFocusScript,
  createLeafletMapHtml,
  createLeafletMapUpdateScript,
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
});
