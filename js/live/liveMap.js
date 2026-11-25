/* =========================================================
   SafeHaven Live - Leaflet map for real child locations
   ========================================================= */

import { config, esc, initials, ago } from './api.js';
import { ZONE_KINDS, zoneKind } from './zones.js';

const TONE_HEX = { safe: '#1f8a5b', attention: '#c47a10', danger: '#d6453d', offline: '#7a7f87', info: '#2f6fdb' };

// Which base map the guardian last chose ('map' or 'satellite'), kept per browser
const BASE_KEY = 'safehaven_map_base';
const readBase = () => {
  try { return localStorage.getItem(BASE_KEY) === 'satellite' ? 'satellite' : 'map'; } catch (e) { return 'map'; }
};

// Zone outlines: on satellite imagery they get brighter colours and a firmer edge so they still read
function zoneStyle(kind, satellite) {
  const k = ZONE_KINDS[kind];
  if (kind === 'restricted') {
    const color = satellite ? '#ff6b61' : k.color;
    return { color, weight: satellite ? 2.5 : 1.75, dashArray: null, fillColor: color, fillOpacity: satellite ? 0.2 : 0.12 };
  }
  const color = satellite ? '#4fe0a0' : k.color;
  return { color, weight: satellite ? 2.25 : 1.5, dashArray: '5 5', fillColor: color, fillOpacity: satellite ? 0.14 : 0.07 };
}

export class LiveMap {
  constructor() {
    this.map = null;
    this.childLayers = {};
    this.zoneLayers = {};
    this.baseLayers = [];
    this.base = readBase();
    this.pickHandler = null;
    this.pickMarker = null;
    this.didFit = false;
  }

  mount(el) {
    if (this.map) return;
    this.map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([20, 0], 2);
    // Place names over satellite imagery: above zone shapes, below child pins, never catching clicks
    const labels = this.map.createPane('labels');
    labels.style.zIndex = 450;
    labels.style.pointerEvents = 'none';
    this.setBase(this.base);
    this.map.on('click', (e) => {
      if (this.pickHandler) this.pickHandler(e.latlng.lat, e.latlng.lng);
    });
  }

  /* 'map' = street map, 'satellite' = aerial imagery with place names on top */
  setBase(base) {
    this.base = base === 'satellite' ? 'satellite' : 'map';
    try { localStorage.setItem(BASE_KEY, this.base); } catch (e) { /* storage blocked: choice lasts this visit */ }
    if (!this.map) return;
    this.baseLayers.forEach((layer) => layer.remove());
    if (this.base === 'satellite') {
      // Imagery isn't available at the deepest zoom everywhere: beyond 18 the 18 tiles are enlarged
      this.baseLayers = [L.tileLayer(config.satelliteTileUrl, { maxZoom: 19, maxNativeZoom: 18, attribution: config.satelliteAttribution })];
      if (config.satelliteLabelsUrl) this.baseLayers.push(L.tileLayer(config.satelliteLabelsUrl, { maxZoom: 19, maxNativeZoom: 18, pane: 'labels' }));
    } else {
      this.baseLayers = [L.tileLayer(config.mapTileUrl, { maxZoom: 19, attribution: config.mapTileAttribution })];
    }
    this.baseLayers.forEach((layer) => layer.addTo(this.map));
    this.map.getContainer().classList.toggle('is-satellite', this.base === 'satellite');
    for (const layer of Object.values(this.zoneLayers)) layer.setStyle(zoneStyle(layer.zoneKind, this.base === 'satellite'));
  }

  invalidate() {
    if (this.map) setTimeout(() => this.map.invalidateSize(), 60);
  }

  // children: [{ id, name, tone, location: {lat,lng,accuracy_m,received_at} | null, selected }]
  setChildren(children) {
    if (!this.map) return;
    const seen = new Set();
    for (const c of children) {
      if (!c.location) continue;
      seen.add(c.id);
      const { lat, lng, accuracy_m: acc, received_at: at } = c.location;
      const color = TONE_HEX[c.tone] || TONE_HEX.info;
      const html = `<span class="live-pin ${c.selected ? 'is-selected' : ''}" style="--pin:${color}">${esc(initials(c.name))}</span>`;
      const icon = L.divIcon({ className: 'live-pin-wrap', html, iconSize: [38, 38], iconAnchor: [19, 19] });
      const popup = `<strong>${esc(c.name)}</strong><br>Accuracy ±${Math.round(acc)} m<br>Received ${esc(ago(at))}`;
      let layer = this.childLayers[c.id];
      if (!layer) {
        layer = {
          circle: L.circle([lat, lng], { radius: acc, color, weight: 1, fillOpacity: 0.12 }).addTo(this.map),
          marker: L.marker([lat, lng], { icon, keyboard: true, title: c.name }).addTo(this.map).bindPopup(popup)
        };
        this.childLayers[c.id] = layer;
      } else {
        layer.circle.setLatLng([lat, lng]).setRadius(acc).setStyle({ color });
        layer.marker.setLatLng([lat, lng]).setIcon(icon).setPopupContent(popup);
      }
    }
    for (const id of Object.keys(this.childLayers)) {
      if (!seen.has(id)) {
        this.childLayers[id].circle.remove();
        this.childLayers[id].marker.remove();
        delete this.childLayers[id];
      }
    }
  }

  // Safe zones: soft green, dashed. Restricted zones: red, solid edge, a touch more fill.
  setZones(zones, onSelect) {
    if (!this.map) return;
    const seen = new Set();
    for (const z of zones) {
      seen.add(z.id);
      const k = zoneKind(z);
      const style = zoneStyle(k.key, this.base === 'satellite');
      let layer = this.zoneLayers[z.id];
      if (!layer) {
        layer = L.circle([z.lat, z.lng], { radius: z.radius_m, ...style }).addTo(this.map);
        layer.on('click', () => onSelect && onSelect(z.id));
        this.zoneLayers[z.id] = layer;
      } else {
        layer.setLatLng([z.lat, z.lng]).setRadius(z.radius_m).setStyle(style);
      }
      layer.zoneKind = k.key; // lets setBase() restyle it when the base map changes
      layer.unbindTooltip().bindTooltip(`${esc(z.name)} · ${k.key === 'restricted' ? 'Restricted · ' : ''}${z.radius_m} m`, { direction: 'top', className: `zone-tip zone-tip--${k.key}` });
    }
    for (const id of Object.keys(this.zoneLayers)) {
      if (!seen.has(id)) {
        this.zoneLayers[id].remove();
        delete this.zoneLayers[id];
      }
    }
  }

  focus(lat, lng, zoom = 16) {
    if (this.map) this.map.flyTo([lat, lng], zoom, { duration: 0.6 });
  }

  fitAll(points) {
    if (!this.map || !points.length) return;
    if (points.length === 1) this.map.setView(points[0], 16);
    else this.map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16 });
    this.didFit = true;
  }

  center() {
    return this.map ? this.map.getCenter() : null;
  }

  zoomBy(d) {
    if (this.map) d > 0 ? this.map.zoomIn() : this.map.zoomOut();
  }

  startPicking(cb) {
    this.pickHandler = cb;
    if (this.map) this.map.getContainer().classList.add('is-picking');
  }

  stopPicking() {
    this.pickHandler = null;
    if (this.map) this.map.getContainer().classList.remove('is-picking');
    if (this.pickMarker) {
      this.pickMarker.remove();
      this.pickMarker = null;
    }
  }

  showPick(lat, lng, radius, kind = 'safe') {
    if (!this.map) return;
    const color = ZONE_KINDS[kind === 'restricted' ? 'restricted' : 'safe'].color;
    if (!this.pickMarker) {
      this.pickMarker = L.circle([lat, lng], { radius, color, weight: 2, fillOpacity: 0.12 }).addTo(this.map);
    } else {
      this.pickMarker.setLatLng([lat, lng]).setRadius(radius).setStyle({ color });
    }
  }
}
