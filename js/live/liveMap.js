/* =========================================================
   SafeHaven Live - Leaflet map for real child locations
   ========================================================= */

import { config, esc, initials, ago } from './api.js';

const TONE_HEX = { safe: '#1f8a5b', attention: '#c47a10', danger: '#d6453d', offline: '#7a7f87', info: '#2f6fdb' };

export class LiveMap {
  constructor() {
    this.map = null;
    this.childLayers = {};
    this.zoneLayers = {};
    this.pickHandler = null;
    this.pickMarker = null;
    this.didFit = false;
  }

  mount(el) {
    if (this.map) return;
    this.map = L.map(el, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer(config.mapTileUrl, { maxZoom: 19, attribution: config.mapTileAttribution }).addTo(this.map);
    this.map.on('click', (e) => {
      if (this.pickHandler) this.pickHandler(e.latlng.lat, e.latlng.lng);
    });
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

  setZones(zones, onSelect) {
    if (!this.map) return;
    const seen = new Set();
    for (const z of zones) {
      seen.add(z.id);
      const style = { color: '#1f8a5b', weight: 1.5, dashArray: '5 5', fillOpacity: 0.08 };
      let layer = this.zoneLayers[z.id];
      if (!layer) {
        layer = L.circle([z.lat, z.lng], { radius: z.radius_m, ...style }).addTo(this.map);
        layer.on('click', () => onSelect && onSelect(z.id));
        this.zoneLayers[z.id] = layer;
      } else {
        layer.setLatLng([z.lat, z.lng]).setRadius(z.radius_m);
      }
      layer.unbindTooltip().bindTooltip(`${esc(z.name)} · ${z.radius_m} m`, { direction: 'top' });
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

  showPick(lat, lng, radius) {
    if (!this.map) return;
    if (!this.pickMarker) {
      this.pickMarker = L.circle([lat, lng], { radius, color: '#2f6fdb', weight: 2, fillOpacity: 0.12 }).addTo(this.map);
    } else {
      this.pickMarker.setLatLng([lat, lng]).setRadius(radius);
    }
  }
}
