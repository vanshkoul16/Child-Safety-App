/* =========================================================
   SafeHaven - Google Maps Controller
   Jammu, J&K Family Coordinates, Real Live GPS & Driving Corridor
   ========================================================= */

import { store } from './state.js';
import { calculateDistance } from './safetyEngine.js';

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

      // Add Zoom Control
      L.control.zoom({ position: 'topright' }).addTo(this.map);

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

    let tileUrl = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'; // Roadmap (default)
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

  onTabActivated() {
    if (!this.map) {
      this.initMap('leaflet-map');
      return;
    }

    requestAnimationFrame(() => {
      if (this.map) this.map.invalidateSize();
    });

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
        const activeChild = store.getChild(store.get().selectedChildId);
        if (activeChild) {
          this.locateChild(activeChild.id);
        }
      }
    }, 150);
  }

  /* Render parent marker with photo avatar */
  renderParentMarker() {
    if (!this.map) return;
    const parent = store.get().parent;

    const parentIcon = L.divIcon({
      className: 'parent-map-marker-container',
      html: `
        <div class="parent-map-marker-real" title="Your Location (${parent.name})">
          <img src="${parent.avatar}" alt="${parent.name}" class="marker-avatar-photo" />
          <div class="marker-label-tag parent">Dad (${parent.name.split(' ')[0]})</div>
        </div>
      `,
      iconSize: [44, 56],
      iconAnchor: [22, 44]
    });

    if (this.parentMarker) {
      this.parentMarker.setLatLng([parent.lat, parent.lng]);
    } else {
      this.parentMarker = L.marker([parent.lat, parent.lng], { icon: parentIcon }).addTo(this.map);
    }

    this.parentMarker.bindPopup(`
      <div class="map-popup-card">
        <div class="map-popup-header">
          <img src="${parent.avatar}" class="map-popup-avatar-img" />
          <div>
            <div class="map-popup-title">${parent.name} (Father & Guardian)</div>
            <div class="map-popup-sub">${parent.role} &bull; ${parent.carrier}</div>
          </div>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-muted); border-top: 1px solid #e2e8f0; padding-top: 0.35rem;">
          🏢 <strong>Current Base / Work:</strong><br/>
          ${parent.address}
        </div>
        <div class="map-popup-actions" style="margin-top: 0.5rem;">
          <button class="btn btn-primary" style="font-size: 0.74rem; width: 100%;" onclick="window.useMyCurrentLocation('parent')">
            📍 Update with My Real GPS
          </button>
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
        color: '#0284c7',
        weight: 1.5,
        fillColor: '#38bdf8',
        fillOpacity: 0.15
      }).addTo(this.map);
    }

    // Pulse Marker
    const liveIcon = L.divIcon({
      className: 'live-user-gps-container',
      html: `
        <div class="live-user-marker-wrap">
          <div class="live-user-pulse-wave"></div>
          <div class="live-user-core-dot"></div>
          <div class="live-user-tag">📍 You (Live GPS)</div>
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
      <div class="map-popup-card">
        <div class="map-popup-header">
          <span style="font-size: 1.8rem;">📍</span>
          <div>
            <div class="map-popup-title">Your Live Device Location</div>
            <div class="map-popup-sub">Accuracy: &plusmn;${liveLoc.accuracy}m &bull; Live GNSS</div>
          </div>
        </div>
        <div style="font-size: 0.76rem; color: #475569; border-top: 1px solid #e2e8f0; padding: 0.4rem 0;">
          <strong>Coordinates:</strong> ${liveLoc.lat.toFixed(5)}&deg; N, ${liveLoc.lng.toFixed(5)}&deg; E<br/>
          <strong>Reported:</strong> Just now
        </div>
        <div class="map-popup-actions" style="display: flex; flex-direction: column; gap: 0.35rem;">
          <button class="btn btn-primary" style="font-size: 0.74rem; width: 100%;" onclick="window.setGuardianToLiveGPS()">
            👤 Set as Guardian Location
          </button>
          <button class="btn btn-secondary" style="font-size: 0.74rem; width: 100%;" onclick="window.setChildToLiveGPS()">
            🎒 Set as Active Child's Live GPS
          </button>
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
      const color = isRestricted ? '#ef4444' : '#10b981';
      const fillColor = isRestricted ? '#ef4444' : '#10b981';
      const fillOpacity = isRestricted ? 0.22 : 0.14;

      if (this.zoneCircles[zone.id]) {
        this.zoneCircles[zone.id].setLatLng([zone.lat, zone.lng]);
        this.zoneCircles[zone.id].setRadius(zone.radius);
      } else {
        const circle = L.circle([zone.lat, zone.lng], {
          radius: zone.radius,
          color: color,
          weight: 2.5,
          dashArray: isRestricted ? '5, 6' : null,
          fillColor: fillColor,
          fillOpacity: fillOpacity
        }).addTo(this.map);

        circle.bindPopup(`
          <div class="map-popup-card">
            <div class="map-popup-header">
              <span style="font-size: 1.5rem;">${zone.icon}</span>
              <div>
                <div class="map-popup-title">${zone.name}</div>
                <div class="map-popup-sub">${zone.address}</div>
              </div>
            </div>
            <div style="font-size: 0.76rem; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 0.35rem;">
              <strong>Geofence Radius:</strong> ${zone.radius} meters (${Math.round(zone.radius * 3.28)} ft)<br/>
              <strong>Active Schedule:</strong> ${zone.activeSchedule}
            </div>
          </div>
        `);

        this.zoneCircles[zone.id] = circle;
      }

      if (!this.zoneCenterIcons[zone.id]) {
        const centerIcon = L.divIcon({
          className: 'zone-center-wrap',
          html: `
            <div class="safe-zone-center-icon ${isRestricted ? 'restricted' : ''}">
              <span>${zone.icon}</span>
            </div>
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
      let statusClass = 'safe';
      if (child.safetyStatus === 'attention') statusClass = 'attention';
      if (child.safetyStatus === 'danger') statusClass = 'danger';
      if (child.safetyStatus === 'unknown') statusClass = 'unknown';

      const activityBadge = child.speed > 0 ? `${child.speed} km/h` : 'Stationary';

      const iconHtml = `
        <div class="child-map-marker-real">
          <div class="marker-pulse-aura ${statusClass}"></div>
          <div class="marker-photo-ring ${statusClass}">
            <img src="${child.avatar}" alt="${child.name}" class="marker-avatar-photo" />
          </div>
          <div class="marker-label-tag ${statusClass}">
            <span class="marker-name">${child.name}</span>
            <span class="marker-speed">${activityBadge}</span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-real-child-icon',
        html: iconHtml,
        iconSize: [58, 68],
        iconAnchor: [29, 54],
        popupAnchor: [0, -52]
      });

      if (this.markers[child.id]) {
        this.markers[child.id].setLatLng([child.lat, child.lng]);
        this.markers[child.id].setIcon(customIcon);
      } else {
        const marker = L.marker([child.lat, child.lng], { icon: customIcon }).addTo(this.map);
        this.markers[child.id] = marker;
      }

      this.markers[child.id].bindPopup(`
        <div class="map-popup-card">
          <div class="map-popup-header">
            <img src="${child.avatar}" class="map-popup-avatar-img" />
            <div>
              <div class="map-popup-title">${child.name} (${child.age} yrs)</div>
              <div class="map-popup-sub">${child.grade}</div>
            </div>
          </div>
          <div style="font-size: 0.76rem; padding: 0.35rem 0; border-top: 1px solid #e2e8f0; line-height: 1.5;">
            <strong>Device:</strong> ${child.device}<br/>
            <strong>Network:</strong> ${child.carrier} &bull; 🔋 ${child.battery}%<br/>
            <strong>Telemetry:</strong> ${child.gpsAccuracy} &bull; ${child.activity}<br/>
            <strong>Current Status:</strong> <span style="color: ${child.safetyStatus === 'safe' ? '#047857' : child.safetyStatus === 'attention' ? '#b45309' : '#dc2626'}; font-weight: 700;">${child.statusReason}</span>
          </div>
          <div class="map-popup-actions">
            <button class="btn btn-primary" style="font-size: 0.74rem; padding: 0.35rem 0.7rem;" onclick="window.locateChild('${child.id}')">
              🎯 Center
            </button>
            <button class="btn btn-secondary" style="font-size: 0.74rem; padding: 0.35rem 0.7rem;" onclick="window.navigateToChild('${child.id}')">
              🧭 Directions from Guardian
            </button>
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

    if (route.length < 2) return;

    const latlngs = route.map(pt => [pt.lat, pt.lng]);
    this.routePolyline = L.polyline(latlngs, {
      color: '#2563eb',
      weight: 4.5,
      opacity: 0.85,
      dashArray: '8, 8',
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
      this.map.invalidateSize();
      this.map.flyTo([child.lat, child.lng], 16, {
        animate: true,
        duration: 1.0
      });

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
      this.map.flyTo([32.7155, 74.8672], 14, {
        animate: true,
        duration: 1.2
      });
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
      this.map.flyTo([liveLoc.lat, liveLoc.lng], 16, {
        animate: true,
        duration: 1.2
      });
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
      this.map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
    }
  }

  /* Compute realistic driving navigation corridor from Guardian to Child */
  navigateToChild(childId) {
    const child = store.getChild(childId);
    const parent = store.get().parent;
    if (!child || !parent) return;

    if (!this.map) {
      this.initMap('leaflet-map');
    }
    if (!this.map) return;

    if (this.navRoutePolyline) {
      this.navRoutePolyline.remove();
    }

    const distMeters = calculateDistance(parent.lat, parent.lng, child.lat, child.lng);
    const distKm = (distMeters / 1000).toFixed(1);
    const estDriveMin = Math.max(5, Math.round(distMeters / 350));

    let routePoints = [];

    // Check if both are within Jammu region (lat ~ 32.65 - 32.75, lng ~ 74.80 - 74.95)
    const isJammuRegion = (lat, lng) => lat > 32.6 && lat < 32.8 && lng > 74.7 && lng < 75.0;

    if (isJammuRegion(parent.lat, parent.lng) && isJammuRegion(child.lat, child.lng)) {
      // Authentic Jammu city road network: Bahu Plaza -> Bikram Chowk -> Tawi Bridge -> Destination
      routePoints = [
        [parent.lat, parent.lng], // Bahu Plaza / Guardian Location
        [32.7075, 74.8735],       // Rail Head to Gandhi Nagar Main Road
        [32.7102, 74.8686],       // Bikram Chowk Intersection
        [32.7135, 74.8675],       // Tawi River Bridge
        [child.lat, child.lng]    // Child's current location
      ];
    } else {
      // Direct geographic corridor for live GPS
      routePoints = [
        [parent.lat, parent.lng],
        [(parent.lat + child.lat) / 2, (parent.lng + child.lng) / 2],
        [child.lat, child.lng]
      ];
    }

    this.navRoutePolyline = L.polyline(routePoints, {
      color: '#10b981',
      weight: 6,
      opacity: 0.95
    }).addTo(this.map);

    this.map.fitBounds(this.navRoutePolyline.getBounds(), { padding: [60, 60] });

    return {
      distance: `${distKm} km via Bikram Chowk & Tawi Corridor`,
      eta: `${estDriveMin} min in local traffic`
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
          html: '<div style="font-size: 1.8rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">📍</div>',
          iconSize: [30, 30],
          iconAnchor: [15, 30]
        })
      }).addTo(this.map);
    }
    this.map.panTo([lat, lng]);
  }
}

export const mapCtrl = new MapController();
