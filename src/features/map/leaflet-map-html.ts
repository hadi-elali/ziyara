import {
  LEAFLET_CSS,
  LEAFLET_JAVASCRIPT,
} from '@/features/map/leaflet-assets.generated';
import type { MapCoordinate, MapPoint } from '@/features/map/map-types';

export type LeafletFocusRequest = MapCoordinate & {
  key: string;
  zoom: number;
};

export type LeafletMapBounds = {
  maxLatitude: number;
  maxLongitude: number;
  minLatitude: number;
  minLongitude: number;
};

export type LeafletMapData = {
  points: MapPoint[];
  selectedColor: string;
  selectedCoordinate?: MapCoordinate | null;
  selectedLabel?: string;
};

export type LeafletMapConfiguration = {
  accessibilityLabel: string;
  backgroundColor: string;
  borderColor: string;
  center: MapCoordinate;
  interactive: boolean;
  interactiveSelection: boolean;
  maxBounds: LeafletMapBounds;
  maxZoom: number;
  minZoom: number;
  surfaceColor: string;
  textColor: string;
  tileErrorMessage: string;
  zoom: number;
  zoomInLabel: string;
  zoomOutLabel: string;
};

function serializeForInlineScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e')
    .replace(/&/gu, '\\u0026')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}

export function createLeafletMapUpdateScript(data: LeafletMapData) {
  return `window.__ZIYARA_MAP__?.update(${serializeForInlineScript(data)}); true;`;
}

export function createLeafletFocusScript(request?: LeafletFocusRequest) {
  return `window.__ZIYARA_MAP__?.focus(${serializeForInlineScript(request ?? null)}); true;`;
}

export function createLeafletMapHtml(
  configuration: LeafletMapConfiguration,
  initialData: LeafletMapData,
) {
  const serializedConfiguration = serializeForInlineScript(configuration);
  const serializedInitialData = serializeForInlineScript(initialData);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src https://tile.openstreetmap.org data: blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
    />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      ${LEAFLET_CSS}
      :root {
        --map-background: #f2efe9;
        --map-border: #d0d0d0;
        --map-surface: #ffffff;
        --map-text: #111111;
      }
      * { box-sizing: border-box; }
      html, body, #map-root, #map { height: 100%; margin: 0; width: 100%; }
      body { background: var(--map-background); overflow: hidden; }
      #map-root { color: var(--map-text); position: relative; }
      #map { background: var(--map-background); font-family: system-ui, sans-serif; }
      .map-dot-wrapper { background: transparent; border: 0; }
      .map-dot {
        border: 3px solid var(--map-surface);
        border-radius: 999px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.28);
        display: block;
        height: 22px;
        width: 22px;
      }
      .map-dot--selected {
        border-radius: 50% 50% 50% 0;
        height: 28px;
        transform: rotate(-45deg);
        width: 28px;
      }
      .leaflet-tooltip {
        background: var(--map-surface);
        border-color: var(--map-border);
        color: var(--map-text);
        white-space: normal;
      }
      .map-tooltip-description {
        display: block;
        font-size: 12px;
        margin-top: 2px;
        max-width: 220px;
      }
      .leaflet-control-attribution,
      .leaflet-control-attribution a { color: #1b4f72; }
      #tile-error {
        background: var(--map-surface);
        border: 1px solid var(--map-border);
        border-radius: 8px;
        left: 50%;
        max-width: calc(100% - 32px);
        padding: 8px 12px;
        pointer-events: none;
        position: absolute;
        text-align: center;
        top: 16px;
        transform: translateX(-50%);
        z-index: 1000;
      }
      #tile-error[hidden] { display: none; }
    </style>
  </head>
  <body>
    <main id="map-root">
      <div id="map"></div>
      <div aria-live="polite" id="tile-error" role="status" hidden></div>
    </main>
    <script>${LEAFLET_JAVASCRIPT}</script>
    <script>
      (() => {
        const configuration = ${serializedConfiguration};
        const initialData = ${serializedInitialData};
        const root = document.getElementById('map-root');
        const tileError = document.getElementById('tile-error');
        const bounds = L.latLngBounds(
          [configuration.maxBounds.minLatitude, configuration.maxBounds.minLongitude],
          [configuration.maxBounds.maxLatitude, configuration.maxBounds.maxLongitude],
        );

        const send = (message) => {
          window.ReactNativeWebView?.postMessage(JSON.stringify(message));
        };
        const clamp = (coordinate) => [
          Math.max(
            configuration.maxBounds.minLatitude,
            Math.min(configuration.maxBounds.maxLatitude, Number(coordinate.latitude)),
          ),
          Math.max(
            configuration.maxBounds.minLongitude,
            Math.min(configuration.maxBounds.maxLongitude, Number(coordinate.longitude)),
          ),
        ];
        const clampZoom = (zoom) =>
          Math.max(configuration.minZoom, Math.min(configuration.maxZoom, Number(zoom)));
        const isCoordinate = (coordinate) =>
          coordinate &&
          Number.isFinite(Number(coordinate.latitude)) &&
          Number.isFinite(Number(coordinate.longitude));

        root.setAttribute('aria-label', configuration.accessibilityLabel);
        document.documentElement.style.setProperty(
          '--map-background',
          configuration.backgroundColor,
        );
        document.documentElement.style.setProperty('--map-border', configuration.borderColor);
        document.documentElement.style.setProperty('--map-surface', configuration.surfaceColor);
        document.documentElement.style.setProperty('--map-text', configuration.textColor);
        tileError.textContent = configuration.tileErrorMessage;

        const map = L.map('map', {
          attributionControl: false,
          boxZoom: configuration.interactive,
          doubleClickZoom: configuration.interactive,
          dragging: configuration.interactive,
          keyboard: configuration.interactive,
          maxBounds: bounds,
          maxBoundsViscosity: 1,
          maxZoom: configuration.maxZoom,
          minZoom: configuration.minZoom,
          preferCanvas: true,
          scrollWheelZoom: configuration.interactive,
          touchZoom: configuration.interactive,
          zoomControl: false,
        }).setView(clamp(configuration.center), clampZoom(configuration.zoom));

        if (configuration.interactive) {
          L.control.zoom({
            zoomInTitle: configuration.zoomInLabel,
            zoomOutTitle: configuration.zoomOutLabel,
          }).addTo(map);
        }

        // Only visible tiles are requested. Android WebView handles the persistent HTTP cache.
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          bounds,
          keepBuffer: 3,
          maxZoom: configuration.maxZoom,
          minZoom: configuration.minZoom,
          updateWhenIdle: true,
          updateWhenZooming: false,
        });
        let failedTileCount = 0;
        tiles.on('tileload', () => {
          failedTileCount = 0;
          tileError.hidden = true;
        });
        tiles.on('tileerror', () => {
          failedTileCount += 1;
          if (failedTileCount >= 3) tileError.hidden = false;
        });
        tiles.addTo(map);

        const attribution = L.control.attribution({ prefix: false }).addTo(map);
        attribution.getContainer()?.addEventListener('click', (event) => {
          if (!(event.target instanceof Element) || !event.target.closest('a')) return;
          event.preventDefault();
          send({ type: 'attributionPress' });
        });

        const pointLayer = L.layerGroup().addTo(map);
        let selectedMarker = null;

        const createDotIcon = (color, selected = false) => {
          const dot = document.createElement('span');
          dot.className = selected ? 'map-dot map-dot--selected' : 'map-dot';
          dot.style.backgroundColor = color;
          return L.divIcon({
            className: 'map-dot-wrapper',
            html: dot,
            iconAnchor: selected ? [14, 28] : [11, 11],
            iconSize: selected ? [28, 28] : [22, 22],
          });
        };

        const createTooltip = (point) => {
          const content = document.createElement('span');
          const title = document.createElement('strong');
          title.textContent = point.title;
          content.append(title);
          if (point.description) {
            const description = document.createElement('span');
            description.className = 'map-tooltip-description';
            description.textContent = point.description;
            content.append(description);
          }
          return content;
        };

        const update = (data) => {
          pointLayer.clearLayers();
          for (const point of Array.isArray(data?.points) ? data.points : []) {
            if (!isCoordinate(point.coordinate)) continue;
            const marker = L.marker(clamp(point.coordinate), {
              alt: point.accessibilityLabel,
              icon: createDotIcon(point.color),
              keyboard: true,
              title: point.accessibilityLabel,
            });
            marker.bindTooltip(createTooltip(point), { direction: 'top', offset: [0, -12] });
            marker.on('click', () => send({ id: point.id, type: 'pointPress' }));
            marker.addTo(pointLayer);
          }

          if (selectedMarker) {
            selectedMarker.remove();
            selectedMarker = null;
          }
          if (isCoordinate(data?.selectedCoordinate)) {
            selectedMarker = L.marker(clamp(data.selectedCoordinate), {
              alt: data.selectedLabel || '',
              draggable: configuration.interactiveSelection,
              icon: createDotIcon(data.selectedColor, true),
              keyboard: true,
              title: data.selectedLabel || '',
            });
            selectedMarker.on('dragend', () => {
              const coordinate = selectedMarker.getLatLng();
              send({
                coordinate: { latitude: coordinate.lat, longitude: coordinate.lng },
                type: 'coordinateChange',
              });
            });
            selectedMarker.addTo(map);
          }
        };

        const focus = (request) => {
          if (!isCoordinate(request)) return;
          map.setView(clamp(request), clampZoom(request.zoom), { animate: true });
        };

        if (configuration.interactiveSelection) {
          map.on('click', (event) => {
            send({
              coordinate: { latitude: event.latlng.lat, longitude: event.latlng.lng },
              type: 'coordinateChange',
            });
          });
        }

        window.__ZIYARA_MAP__ = { focus, update };
        update(initialData);
        new ResizeObserver(() => map.invalidateSize(false)).observe(root);
        send({ type: 'ready' });
      })();
    </script>
  </body>
</html>`;
}
