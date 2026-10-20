/* =========================================================
   SafeHaven - Google Maps Controller
   Jammu, J&K Family Coordinates, Real Live GPS & Driving Corridor
   ========================================================= */

import { store } from './state.js';
import { calculateDistance } from './safetyEngine.js';
import { icon, zoneIcon, clean, short, statusOf, accuracyMeters } from './icons.js';

const TONE_HEX = { safe: '#1f8a5b', attention: '#c47a10', danger: '#d6453d', offline: '#7a7f87' };

function fmtDistance(m) {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
}

/* Turn an OSRM step into a human instruction + icon */
function describeStep(step, childName) {
  const m = step.maneuver || {};
  const mod = m.modifier || '';
  // OSM names can be in local scripts; keep instructions readable by only using Latin-script road names
  const name = step.name && /^[\u0000-\u024F\u2000-\u206F\s]+$/.test(step.name) ? step.name : '';
  const road = name ? ` onto ${name}` : '';
  const dir = mod.replace('uturn', 'U-turn');
  const ic = m.type === 'arrive' ? 'flag' : m.type === 'depart' ? 'navigation' : mod.includes('left') ? 'turnLeft' : mod.includes('right') ? 'turnRight' : 'straight';
  let text;
  switch (m.type) {
    case 'depart': text = `Start${name ? ` on ${name}` : ''}`; break;
    case 'arrive': text = `Arrive at ${childName}'s location`; break;
    case 'roundabout': case 'rotary': text = `At the roundabout, take exit ${m.exit || 1}${road}`; break;
    case 'fork': text = `Keep ${dir || 'straight'} at the fork${road}`; break;
    case 'merge': text = `Merge ${dir}${road}`.replace('  ', ' '); break;
    case 'on ramp': text = `Take the ramp${road}`; break;
    case 'off ramp': text = `Take the exit${road}`; break;
    case 'continue': case 'new name': text = `Continue${dir && dir !== 'straight' ? ` ${dir}` : ''}${road || ' straight'}`; break;
    default: text = dir === 'straight' ? `Continue straight${road}` : `Turn ${dir}${road}`;
  }
  return { icon: ic, text: text.charAt(0).toUpperCase() + text.slice(1), dist: step.distance > 0 ? fmtDistance(step.distance) : '' };
}

/* Shortest distance (m) from a point to a polyline, equirectangular approximation (fine at city scale) */
function distanceToPolyline(lat, lng, pts) {
  if (!pts || pts.length === 0) return null;
  const R = 6371000, toRad = Math.PI / 180, kx = Math.cos(lat * toRad) * R * toRad, ky = R * toRad;
  const P = (q) => [(q.lng - lng) * kx, (q.lat - lat) * ky];
  if (pts.length === 1) { const [x, y] = P(pts[0]); return Math.hypot(x, y); }
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = P(pts[i]), [bx, by] = P(pts[i + 1]);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export class MapController {
  constructor() {
    this.map = null;
    this.markers = {};
    this.zoneCircles = {};
    this.zoneCenterIcons = {};
    this.routePolyline = null;
    this.parentMarker = null;
    this.liveUserMarker = null;
    this.liveUserAccuracyCircle = null;
    this.navRoutePolyline = null;
    this.corridorPolyline = null;
    this.accuracyCircles = {};
    this.pickerMarker = null;
    this.isPickerActive = false;
    this.onPickerLocationSelected = null;
    this.currentTileLayer = null;
    this.activeMapStyle = 'google_streets'; // 'google_streets' | 'google_hybrid' | 'google_terrain'
  }

  initMap(elementId = 'leaflet-map') {
    if (typeof L === 'undefined') {
      console.warn('Leaflet is loading, retrying initMap...');
      setTimeout(() => this.initMap(elementId), 100);
      return;
    }

    const container = document.getElementById(elementId);
    if (!container) return;

    if (this.map) {
      const currentContainer = this.map.getContainer();
      if (currentContainer && document.body.contains(currentContainer) && currentContainer === container) {
        this.map.invalidateSize();
        return;
      } else {
        try {
          this.map.remove();
        } catch (e) {
          console.warn('Map cleanup notice:', e);
        }
        this.map = null;
        this.markers = {};
        this.zoneCircles = {};
        this.zoneCenterIcons = {};
        this.liveUserMarker = null;
        this.liveUserAccuracyCircle = null;
        this.accuracyCircles = {};
        this.corridorPolyline = null;
        this.routePolyline = null;
        this.navRoutePolyline = null;
      }
    }

    if (container._leaflet_id) {
      delete container._leaflet_id;
    }

    const state = store.get();
    const activeChild = store.getChild(state.selectedChildId);
    // Center on active child or default Jammu city coordinates
    const centerLat = activeChild ? activeChild.lat : 32.7155;
    const centerLng = activeChild ? activeChild.lng : 74.8672;

    try {
      this.map = L.map(elementId, {
        center: [centerLat, centerLng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false
      });

      // Set Google Maps tile layer
      this.setMapStyle(this.activeMapStyle);

      // Map click handler for geofence picker
      this.map.on('click', (e) => {
        if (this.isPickerActive && this.onPickerLocationSelected) {
          this.onPickerLocationSelected(e.latlng.lat, e.latlng.lng);
        }
      });

      // Initial layer render
      this.renderSafeZones();
      this.renderParentMarker();
      this.renderChildrenMarkers();
      this.renderSelectedChildRoute();
      this.renderLiveUserMarker();

      // Keep Leaflet's size in sync with layout changes (tab switches, sidebar, resizes)
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          if (this.map && container.offsetWidth > 0) this.map.invalidateSize({ pan: false });
        });
        this.resizeObserver.observe(container);
      }

      requestAnimationFrame(() => {
        if (this.map) this.map.invalidateSize();
      });
      setTimeout(() => {
        if (this.map) this.map.invalidateSize();
      }, 200);

    } catch (err) {
      console.error('Map init error:', err);
    }
  }

  /* Switch Google Maps layer */
  setMapStyle(styleType) {
    this.activeMapStyle = styleType;
    if (!this.map) return;

    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
    }

    // Roadmap (default) — business/POI pins hidden for a calmer base map
    let tileUrl = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&apistyle=s.t%3A2%7Cs.e%3Al%7Cp.v%3Aoff';
    let maxZoom = 20;

    if (styleType === 'google_hybrid') {
      // Google Satellite + Street Labels
      tileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
    } else if (styleType === 'google_terrain') {
      // Google Topographic Terrain
      tileUrl = 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
    } else if (styleType === 'google_satellite') {
      tileUrl = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
    }

    this.currentTileLayer = L.tileLayer(tileUrl, {
      maxZoom: maxZoom,
      className: `tiles tiles--${styleType}`,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    }).addTo(this.map);

    // Fallback handler if Google tiles are rate-limited or blocked
    if (this.currentTileLayer && typeof this.currentTileLayer.on === 'function') {
      this.currentTileLayer.on('tileerror', () => {
        if (this.currentTileLayer && !this.currentTileLayer._hasFallenBack && typeof this.currentTileLayer.setUrl === 'function') {
          this.currentTileLayer._hasFallenBack = true;
          this.currentTileLayer.setUrl('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png');
        }
      });
    }

    // Update active state in UI pills if present
    document.querySelectorAll('.map-style-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === styleType);
    });
  }

  /* Run a view change only when the map is actually visible. Leaflet computes NaN
     coordinates if it animates or fits bounds inside a hidden (0×0) container, so
     moves requested while the Map tab is hidden are queued and replayed on return. */
  _move(fn) {
    if (!this.map) return;
    const c = this.map.getContainer();
    if (c.offsetWidth > 0 && c.offsetHeight > 0) {
      this.pendingMove = null;
      this.map.invalidateSize({ pan: false });
      fn(this.map);
    } else {
      this.pendingMove = fn;
    }
  }

  onTabActivated() {
    if (!this.map) {
      this.initMap('leaflet-map');
      return;
    }

    requestAnimationFrame(() => {
      if (this.map) this.map.invalidateSize();
    });

    setTimeout(() => {
      if (!this.map) return;
      this.map.invalidateSize();
      if (this.pendingMove) {
        const fn = this.pendingMove;
        this.pendingMove = null;
        this._move(fn);
        return;
      }
      const activeChild = store.getChild(store.get().selectedChildId);
      if (activeChild) {
        this.locateChild(activeChild.id);
      }
    }, 150);
  }

  onTabDeactivated() {
    if (this.map) this.map.stop();
  }

  /* Padding that keeps fitted content clear of the floating overlays */
  _fitPadding() {
    const c = this.map.getContainer();
    if (c.offsetWidth < 768) {
      return { paddingTopLeft: [24, 130], paddingBottomRight: [24, Math.round(c.offsetHeight * 0.45)] };
    }
    return { paddingTopLeft: [60, 90], paddingBottomRight: [Math.min(420, Math.round(c.offsetWidth * 0.35)), 60] };
  }

  /* Render parent marker with photo avatar */
  renderParentMarker() {
    if (!this.map) return;
    const parent = store.get().parent;

    const parentIcon = L.divIcon({
      className: 'parent-map-marker-container',
      html: `
        <div class="mk mk--guardian" title="${parent.name}">
          <span class="mk__photo mk__photo--initial">${parent.name.charAt(0)}</span>
          <span class="mk__tag">You</span>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22]
    });

    if (this.parentMarker) {
      this.parentMarker.setLatLng([parent.lat, parent.lng]);
    } else {
      this.parentMarker = L.marker([parent.lat, parent.lng], { icon: parentIcon }).addTo(this.map);
    }

    this.parentMarker.bindPopup(`
      <div class="pop">
        <div class="pop__head">
          <span class="avatar avatar--sm avatar--initial">${parent.name.charAt(0)}</span>
          <div>
            <div class="pop__title">${parent.name}</div>
            <div class="pop__sub">Guardian · ${short(parent.carrier)}</div>
          </div>
        </div>
        <dl class="pop__list">
          <div><dt>Base</dt><dd>${clean(parent.address)}</dd></div>
        </dl>
        <div class="pop__actions">
          <button class="btn btn--soft btn--sm btn--block" onclick="window.useMyCurrentLocation('parent')">${icon('locate', 14)} Use my real GPS</button>
        </div>
      </div>
    `);
  }

  /* Render live hardware GPS location marker & accuracy aura */
  renderLiveUserMarker() {
    if (!this.map) return;
    const liveLoc = store.get().userLiveLocation;

    if (!liveLoc) {
      if (this.liveUserMarker) {
        this.liveUserMarker.remove();
        this.liveUserMarker = null;
      }
      if (this.liveUserAccuracyCircle) {
        this.liveUserAccuracyCircle.remove();
        this.liveUserAccuracyCircle = null;
      }
      return;
    }

    const pos = [liveLoc.lat, liveLoc.lng];

    // Accuracy Circle
    if (this.liveUserAccuracyCircle) {
      this.liveUserAccuracyCircle.setLatLng(pos);
      this.liveUserAccuracyCircle.setRadius(liveLoc.accuracy);
    } else {
      this.liveUserAccuracyCircle = L.circle(pos, {
        radius: liveLoc.accuracy,
        color: '#2f6fdb',
        weight: 1,
        fillColor: '#2f6fdb',
        fillOpacity: 0.1
      }).addTo(this.map);
    }

    // Pulse Marker
    const liveIcon = L.divIcon({
      className: 'live-user-gps-container',
      html: `
        <div class="mk mk--live">
          <span class="mk__wave"></span>
          <span class="mk__dot"></span>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -18]
    });

    if (this.liveUserMarker) {
      this.liveUserMarker.setLatLng(pos);
    } else {
      this.liveUserMarker = L.marker(pos, { icon: liveIcon, zIndexOffset: 1200 }).addTo(this.map);
    }

    this.liveUserMarker.bindPopup(`
      <div class="pop">
        <div class="pop__head">
          <span class="pop__icon pop__icon--info">${icon('locate', 16)}</span>
          <div>
            <div class="pop__title">Your live location</div>
            <div class="pop__sub">Accurate to ±${liveLoc.accuracy} m · just now</div>
          </div>
        </div>
        <dl class="pop__list">
          <div><dt>Coordinates</dt><dd class="mono">${liveLoc.lat.toFixed(5)}, ${liveLoc.lng.toFixed(5)}</dd></div>
        </dl>
        <div class="pop__actions pop__actions--stack">
          <button class="btn btn--primary btn--sm btn--block" onclick="window.setGuardianToLiveGPS()">Set as guardian location</button>
          <button class="btn btn--soft btn--sm btn--block" onclick="window.setChildToLiveGPS()">Set as selected child's location</button>
        </div>
      </div>
    `);
  }

  /* Render safe zone circles on map */
  renderSafeZones() {
    if (!this.map) return;
    const safeZones = store.get().safeZones;

    const currentZoneIds = new Set(safeZones.map(z => z.id));
    Object.keys(this.zoneCircles).forEach(id => {
      if (!currentZoneIds.has(id)) {
        this.zoneCircles[id].remove();
        delete this.zoneCircles[id];
      }
    });
    Object.keys(this.zoneCenterIcons).forEach(id => {
      if (!currentZoneIds.has(id)) {
        this.zoneCenterIcons[id].remove();
        delete this.zoneCenterIcons[id];
      }
    });

    safeZones.forEach(zone => {
      const isRestricted = zone.isRestricted;
      const color = isRestricted ? '#d6453d' : '#1f8a5b';
      const fillColor = color;
      const fillOpacity = isRestricted ? 0.14 : 0.1;

      if (this.zoneCircles[zone.id]) {
        this.zoneCircles[zone.id].setLatLng([zone.lat, zone.lng]);
        this.zoneCircles[zone.id].setRadius(zone.radius);
      } else {
        const circle = L.circle([zone.lat, zone.lng], {
          radius: zone.radius,
          color: color,
          weight: 1.5,
          dashArray: isRestricted ? '4, 6' : null,
          fillColor: fillColor,
          fillOpacity: fillOpacity
        }).addTo(this.map);

        circle.bindPopup(`
          <div class="pop">
            <div class="pop__head">
              <span class="pop__icon ${isRestricted ? 'pop__icon--danger' : 'pop__icon--safe'}">${zoneIcon(zone.type, 16)}</span>
              <div>
                <div class="pop__title">${clean(zone.name)}</div>
                <div class="pop__sub">${clean(zone.address)}</div>
              </div>
            </div>
            <dl class="pop__list">
              <div><dt>Radius</dt><dd>${zone.radius} m</dd></div>
              <div><dt>Schedule</dt><dd>${clean(zone.activeSchedule)}</dd></div>
            </dl>
          </div>
        `);

        this.zoneCircles[zone.id] = circle;
      }

      if (!this.zoneCenterIcons[zone.id]) {
        const centerIcon = L.divIcon({
          className: 'zone-center-wrap',
          html: `
            <div class="mk-zone ${isRestricted ? 'mk-zone--danger' : ''}">${zoneIcon(zone.type, 14)}</div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const centerMarker = L.marker([zone.lat, zone.lng], { icon: centerIcon }).addTo(this.map);
        this.zoneCenterIcons[zone.id] = centerMarker;
      } else {
        this.zoneCenterIcons[zone.id].setLatLng([zone.lat, zone.lng]);
      }
    });
  }

  /* Render real child markers with real photographic avatars & pulse aura */
  renderChildrenMarkers() {
    if (!this.map) return;
    const children = store.get().children;

    children.forEach(child => {
      const tone = statusOf(child).tone;
      const isSelected = child.id === store.get().selectedChildId;
      const activityBadge = child.speed > 0 ? `${child.speed} km/h` : '';

      const iconHtml = `
        <div class="mk mk--child tone-${tone} ${isSelected ? 'is-selected' : ''}">
          <span class="mk__aura ${tone === 'safe' ? 'mk__aura--soft' : ''}"></span>
          <span class="mk__photo"><img src="${child.avatar}" alt="" /></span>
          <span class="mk__tag">${child.name}${activityBadge ? `<em>${activityBadge}</em>` : ''}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-real-child-icon',
        html: iconHtml,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        popupAnchor: [0, -26]
      });

      const acc = accuracyMeters(child.gpsAccuracy);
      if (acc) {
        if (this.accuracyCircles[child.id]) {
          this.accuracyCircles[child.id].setLatLng([child.lat, child.lng]).setRadius(acc).setStyle({ color: TONE_HEX[tone], fillColor: TONE_HEX[tone] });
        } else {
          this.accuracyCircles[child.id] = L.circle([child.lat, child.lng], {
            radius: acc, color: TONE_HEX[tone], weight: 1, opacity: 0.6, fillColor: TONE_HEX[tone], fillOpacity: 0.18, interactive: false
          }).addTo(this.map);
        }
      }

      if (this.markers[child.id]) {
        this.markers[child.id].setLatLng([child.lat, child.lng]);
        this.markers[child.id].setIcon(customIcon);
      } else {
        const marker = L.marker([child.lat, child.lng], { icon: customIcon, zIndexOffset: 500 }).addTo(this.map);
        this.markers[child.id] = marker;
      }

      const st = statusOf(child);
      this.markers[child.id].bindPopup(`
        <div class="pop">
          <div class="pop__head">
            <span class="avatar avatar--sm ring-${st.tone}"><img src="${child.avatar}" alt="" /></span>
            <div>
              <div class="pop__title">${child.name} <span class="pill pill--${st.tone} pill--xs">${st.label}</span></div>
              <div class="pop__sub">${clean(child.activity)}</div>
            </div>
          </div>
          <p class="pop__note">${clean(child.statusReason)}</p>
          <dl class="pop__list">
            <div><dt>Battery</dt><dd>${child.battery}%</dd></div>
            <div><dt>Network</dt><dd>${short(child.carrier)}</dd></div>
            <div><dt>Accuracy</dt><dd>${clean(child.gpsAccuracy)}</dd></div>
          </dl>
          <div class="pop__actions">
            <button class="btn btn--primary btn--sm" onclick="window.navigateToChild('${child.id}')">${icon('navigation', 14)} Directions</button>
            <button class="btn btn--soft btn--sm" onclick="window.callChildPhone('${child.name}')">${icon('phone', 14)} Call</button>
          </div>
        </div>
      `);
    });
  }

  /* Render real travel route along actual streets */
  renderSelectedChildRoute() {
    if (!this.map) return;
    const state = store.get();
    const route = state.routes[state.selectedChildId] || [];

    if (this.routePolyline) {
      this.routePolyline.remove();
      this.routePolyline = null;
    }
    if (this.corridorPolyline) {
      this.corridorPolyline.remove();
      this.corridorPolyline = null;
    }

    if (route.length < 2) return;

    const latlngs = route.map(pt => [pt.lat, pt.lng]);
    // Approved corridor: wide translucent band the child is expected to stay within
    this.corridorPolyline = L.polyline(latlngs, {
      color: '#2f6fdb',
      weight: 26,
      opacity: 0.18,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(this.map);
    this.routePolyline = L.polyline(latlngs, {
      color: '#2f6fdb',
      weight: 4,
      opacity: 0.85,
      dashArray: '1, 9',
      lineCap: 'round'
    }).addTo(this.map);
  }

  locateChild(childId) {
    const child = store.getChild(childId);
    if (!child) return;

    if (!this.map) {
      this.initMap('leaflet-map');
    }

    if (this.map) {
      this._move(m => m.flyTo([child.lat, child.lng], 16, { animate: true, duration: 1.0 }));

      setTimeout(() => {
        if (this.markers[childId] && typeof this.markers[childId].openPopup === 'function') {
          this.markers[childId].openPopup();
        }
      }, 550);
    }
  }

  /* Fly smoothly to Jammu family hub */
  goToJammu() {
    if (!this.map) {
      this.initMap('leaflet-map');
    }
    if (this.map) {
      this._move(m => m.flyTo([32.7155, 74.8672], 14, { animate: true, duration: 1.2 }));
    }
  }

  /* Fly smoothly to user's live physical GPS location */
  goToLiveGPS() {
    const liveLoc = store.get().userLiveLocation;
    if (!liveLoc) return false;
    if (!this.map) {
      this.initMap('leaflet-map');
    }
    if (this.map) {
      this._move(m => m.flyTo([liveLoc.lat, liveLoc.lng], 16, { animate: true, duration: 1.2 }));
      setTimeout(() => {
        if (this.liveUserMarker) {
          this.liveUserMarker.openPopup();
        }
      }, 600);
    }
    return true;
  }

  fitAllMapBounds() {
    if (!this.map) return;
    const state = store.get();
    const points = [];

    state.children.forEach(c => points.push([c.lat, c.lng]));
    points.push([state.parent.lat, state.parent.lng]);
    state.safeZones.forEach(z => points.push([z.lat, z.lng]));

    if (state.userLiveLocation) {
      points.push([state.userLiveLocation.lat, state.userLiveLocation.lng]);
    }

    if (points.length > 0) {
      this._move(m => m.fitBounds(points, { padding: [50, 50], maxZoom: 16 }));
    }
  }

  /* Compute realistic driving navigation corridor from Guardian to Child */
  /* Distance (m) between a child and their approved route, or null if no route */
  routeDeviationMeters(childId) {
    const child = store.getChild(childId);
    const route = store.get().routes[childId] || [];
    if (!child || route.length < 2) return null;
    return distanceToPolyline(child.lat, child.lng, route);
  }

  clearNavigation() {
    if (this.navRoutePolyline) {
      this.navRoutePolyline.remove();
      this.navRoutePolyline = null;
    }
  }

  /* Guardian → child driving directions. Uses OSRM for real turn-by-turn steps, falls back to an approximate corridor. */
  async navigateToChild(childId) {
    const child = store.getChild(childId);
    const parent = store.get().parent;
    if (!child || !parent) return null;

    if (!this.map) {
      this.initMap('leaflet-map');
    }
    if (!this.map) return null;

    this.clearNavigation();

    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${parent.lat},${parent.lng}&destination=${child.lat},${child.lng}&travelmode=driving`;
    const drawRoute = (latlngs) => {
      this.clearNavigation();
      this.navRoutePolyline = L.polyline(latlngs, { color: '#0f5c4d', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(this.map);
      const bounds = this.navRoutePolyline.getBounds();
      this._move(m => m.fitBounds(bounds, { ...this._fitPadding(), maxZoom: 17 }));
    };

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const url = `https://router.project-osrm.org/route/v1/driving/${parent.lng},${parent.lat};${child.lng},${child.lat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json();
      const route = data && data.routes && data.routes[0];
      if (!route) throw new Error('No route');

      drawRoute(route.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
      const steps = route.legs.flatMap(leg => leg.steps).map(st => describeStep(st, child.name));
      return {
        distance: fmtDistance(route.distance),
        eta: `${Math.max(1, Math.round(route.duration / 60))} min`,
        steps,
        source: 'osrm',
        gmapsUrl
      };
    } catch (err) {
      console.warn('Turn-by-turn routing unavailable, using approximate corridor:', err);
    }

    const distMeters = calculateDistance(parent.lat, parent.lng, child.lat, child.lng);
    const estDriveMin = Math.max(5, Math.round(distMeters / 350));
    const isJammuRegion = (lat, lng) => lat > 32.6 && lat < 32.8 && lng > 74.7 && lng < 75.0;
    let routePoints;
    let steps;

    if (isJammuRegion(parent.lat, parent.lng) && isJammuRegion(child.lat, child.lng)) {
      // Known Jammu corridor: Bahu Plaza -> Gandhi Nagar Main Road -> Bikram Chowk -> Tawi Bridge -> destination
      routePoints = [
        [parent.lat, parent.lng],
        [32.7075, 74.8735],
        [32.7102, 74.8686],
        [32.7135, 74.8675],
        [child.lat, child.lng]
      ];
      steps = [
        { icon: 'navigation', text: 'Start from Bahu Plaza, Rail Head', dist: '' },
        { icon: 'turnLeft', text: 'Turn left onto Gandhi Nagar Main Road', dist: '600 m' },
        { icon: 'straight', text: 'Continue straight through Bikram Chowk', dist: '550 m' },
        { icon: 'turnRight', text: 'Turn right and cross the Tawi River Bridge', dist: '400 m' },
        { icon: 'flag', text: `Arrive at ${child.name}'s location`, dist: '' }
      ];
    } else {
      routePoints = [[parent.lat, parent.lng], [child.lat, child.lng]];
      steps = [
        { icon: 'navigation', text: 'Start from your location', dist: '' },
        { icon: 'flag', text: `Arrive at ${child.name}'s location`, dist: fmtDistance(distMeters) }
      ];
    }

    drawRoute(routePoints);
    return {
      distance: fmtDistance(distMeters),
      eta: `~${estDriveMin} min`,
      steps,
      source: 'approx',
      gmapsUrl
    };
  }

  enableLocationPicker(callback) {
    this.isPickerActive = true;
    this.onPickerLocationSelected = callback;
    if (this.map) {
      this.map.getContainer().style.cursor = 'crosshair';
    }
  }

  disableLocationPicker() {
    this.isPickerActive = false;
    this.onPickerLocationSelected = null;
    if (this.map) {
      this.map.getContainer().style.cursor = '';
    }
    if (this.pickerMarker) {
      this.pickerMarker.remove();
      this.pickerMarker = null;
    }
  }

  setPickerMarker(lat, lng) {
    if (!this.map) return;
    if (this.pickerMarker) {
      this.pickerMarker.setLatLng([lat, lng]);
    } else {
      this.pickerMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'picker-icon-wrap',
          html: `<div class="mk-picker">${icon('pin', 30)}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30]
        })
      }).addTo(this.map);
    }
    this._move(m => m.panTo([lat, lng]));
  }
}

export const mapCtrl = new MapController();
