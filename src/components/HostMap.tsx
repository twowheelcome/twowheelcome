import { useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { SAFETY } from '../lib/theme'
import { useTheme } from '../lib/ThemeContext'

// Map DB parking keys → SAFETY keys
const DB_TO_SAFETY: Record<string, keyof typeof SAFETY> = {
  garage_locked: 'locked_garage',
  locked_garage: 'locked_garage',
  carport:       'carport',
  yard:          'fenced_yard',
  fenced_yard:   'fenced_yard',
  street:        'street',
}

let savedMapView: { center: [number, number]; zoom: number } | null = null

interface Host {
  id: string
  location_lat: number
  location_lng: number
  location_city: string
  location_country: string
  parking: string
  parkings?: string[]
  sleep_types?: string[]
  amenities?: string[]
  pricing: string
  profiles: { full_name: string; avatar_url?: string | null } | null
  avg_rating: number | null
  review_count: number
  last_review: { rating: number; body: string | null; reviewer_name: string | null } | null
}

function injectLeafletCSS() {
  if (document.getElementById('leaflet-css')) return
  const link = document.createElement('link')
  link.id = 'leaflet-css'; link.rel = 'stylesheet'
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
  document.head.appendChild(link)
}

export default function HostMap({
  hosts,
  onHostSelect,
  buddyIds = [],
  satellite = false,
  onSatelliteToggle,
}: {
  hosts: Host[]
  onHostSelect: (host: Host) => void
  buddyIds?: string[]
  satellite?: boolean
  onSatelliteToggle?: () => void
}) {
  const C = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const circlesRef = useRef<any[]>([])
  const hostsRef = useRef(hosts); hostsRef.current = hosts
  const buddyRef = useRef(buddyIds); buddyRef.current = buddyIds
  const satelliteRef = useRef(satellite)
  const tileLayerRef = useRef<any>(null)
  const overlayLayersRef = useRef<any[]>([])
  satelliteRef.current = satellite
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')

  function getSafetyKey(host: Host): keyof typeof SAFETY {
    const primary = host.parkings?.[0] || host.parking
    return DB_TO_SAFETY[primary] || 'street'
  }

  function addMarkers(L: any, currentHosts: Host[]) {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    circlesRef.current.forEach(c => c.remove())
    circlesRef.current = [];
    (window as any).__twwHandlers = {}

    currentHosts.forEach(host => {
      if (!host.location_lat || !host.location_lng) return
      const safetyKey = getSafetyKey(host)
      const safety = SAFETY[safetyKey]
      const isBuddy = buddyRef.current.includes(host.id)
      const pinColor = isBuddy ? C.buddy : C.accent
      const size = isBuddy ? 44 : 36

      // Fuzz circle for non-buddy hosts
      if (!isBuddy) {
        const circle = L.circle([host.location_lat, host.location_lng], {
          radius: 500,
          color: C.accent,
          fill: false,
          dashArray: '8 6',
          weight: 2,
          opacity: 0.55,
        }).addTo(mapInstanceRef.current)
        circlesRef.current.push(circle)
      }

      const buddyStar = isBuddy ? `<div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:14px;line-height:1;">⭐</div>` : ''
      const avatarInner = host.profiles?.avatar_url
        ? `<img src="${host.profiles.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${isBuddy ? 16 : 13}px;font-weight:700;color:${C.white};">${(host.profiles?.full_name || 'R')[0].toUpperCase()}</div>`

      const markerHtml = `
        <div style="position:relative;width:${size}px;height:${size + 8}px;">
          ${buddyStar}
          <div style="
            position:absolute;left:0;top:0;width:${size}px;height:${size}px;
            background:${pinColor};
            border-radius:50%;
            border:2.5px solid ${isBuddy ? C.buddy : C.white};
            box-shadow:0 2px 10px rgba(0,0,0,0.6);
            overflow:hidden;
            cursor:pointer;
          ">
            ${avatarInner}
          </div>
          <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${pinColor};"></div>
        </div>
      `

      const markerIcon = L.divIcon({
        html: markerHtml,
        className: '',
        iconSize: [size, size + 8],
        iconAnchor: [size / 2, size + 8],
      });

      (window as any).__twwHandlers[host.id] = () => onHostSelect(host)

      const privacyLine = isBuddy
        ? `<div style="font-size:11px;color:${C.buddy};margin-top:4px;">⭐ You've stayed here before</div>`
        : `<div style="font-size:11px;color:${C.textDim};margin-top:4px;">🔒 Approx. area · exact spot comes from the host</div>`

      const avatarHtml = host.profiles?.avatar_url
        ? `<img src="${host.profiles.avatar_url}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid ${isBuddy ? C.buddy : C.accent};flex-shrink:0;" />`
        : `<div style="width:36px;height:36px;border-radius:50%;background:${C.accent}33;border:2px solid ${isBuddy ? C.buddy : C.accent};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${C.accent};flex-shrink:0;">${(host.profiles?.full_name || 'R')[0].toUpperCase()}</div>`

      const sleepLabels: Record<string, string> = { tent: '⛺ Tent', roof: '🏠 Roof', room: '🛏 Room' }
      const amenityIcons: Record<string, string> = { shower: '🚿', toilet: '🚽', kitchen: '🍳', laundry: '👕', electricity: '⚡', wifi: '📶', pub_nearby: '🍺', breakfast: '☕', dinner: '🍽', local_routes: '🗺', group_ride: '🏍' }

      const sleepHtml = host.sleep_types?.length
        ? `<div style="color:${C.textDim};font-size:11px;margin:5px 0 2px;">${(host.sleep_types as string[]).map(s => sleepLabels[s] || s).join(' · ')}</div>`
        : ''

      const amenitiesHtml = host.amenities?.length
        ? `<div style="font-size:14px;letter-spacing:1px;margin:4px 0;">${(host.amenities as string[]).slice(0, 8).map(a => amenityIcons[a] || '').filter(Boolean).join(' ')}</div>`
        : ''

      const lastReviewHtml = host.last_review?.body
        ? `<div style="margin-top:7px;background:${C.elevated};border-radius:7px;padding:7px 9px;border-left:3px solid #F5C842;">
             <div style="color:#F5C842;font-size:11px;margin-bottom:2px;">${'★'.repeat(host.last_review.rating)}${'☆'.repeat(5 - host.last_review.rating)}</div>
             <div style="color:${C.text};font-size:11px;font-style:italic;line-height:1.4;">"${host.last_review.body}"</div>
             ${host.last_review.reviewer_name ? `<div style="color:${C.textDim};font-size:10px;margin-top:3px;">— ${host.last_review.reviewer_name}</div>` : ''}
           </div>`
        : ''

      const popupContent = `
        <div style="font-family:-apple-system,sans-serif;min-width:210px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            ${avatarHtml}
            <div>
              <div style="font-weight:700;font-size:14px;color:${C.text};">${host.profiles?.full_name || 'Rider'}${isBuddy ? ' ⭐' : ''}</div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:${C.textDim};font-size:12px;">📍 ${host.location_city}</span>
                ${host.avg_rating != null ? `<span style="color:#F5C842;font-weight:700;font-size:12px;">★ ${host.avg_rating.toFixed(1)}</span><span style="color:${C.textDim};font-size:11px;">(${host.review_count})</span>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;background:${safety.color}18;border:1px solid ${safety.color}55;border-radius:8px;padding:6px 8px;margin:5px 0 3px;">
            <span style="font-size:16px;">${safety.icon}</span>
            <div>
              <div style="color:${safety.color};font-weight:700;font-size:12px;">${safety.label}</div>
              <div style="color:${C.textDim};font-size:10px;">${safety.sub}</div>
            </div>
          </div>
          ${sleepHtml}
          ${amenitiesHtml}
          ${privacyLine}
          ${lastReviewHtml}
          <button onclick="window.__twwHandlers['${host.id}']()"
            style="margin-top:8px;background:${C.accent};color:white;border:none;padding:9px 14px;border-radius:100px;cursor:pointer;width:100%;font-weight:700;font-size:12px;letter-spacing:1px;">
            KNOCK ON THE DOOR →
          </button>
        </div>
      `

      const marker = L.marker([host.location_lat, host.location_lng], { icon: markerIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(popupContent, { className: 'tww-popup', maxWidth: 280 })

      markersRef.current.push(marker)
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return
    injectLeafletCSS()

    // Dark popup style
    const style = document.createElement('style')
    style.textContent = [
      `.tww-popup .leaflet-popup-content-wrapper{background:${C.surface};border:1px solid ${C.border};border-radius:14px;padding:0;box-shadow:0 6px 32px rgba(0,0,0,0.7);}`,
      `.tww-popup .leaflet-popup-content{margin:12px;}`,
      `.tww-popup .leaflet-popup-tip{background:${C.surface};}`,
      `.leaflet-popup-close-button{color:${C.textDim} !important;}`,
    ].join('')
    document.head.appendChild(style)

    import('leaflet').then(mod => {
      if (!mapRef.current) return
      const L = mod.default
      const initialCenter = savedMapView?.center ?? [49.5, 15.5]
      const initialZoom = savedMapView?.zoom ?? 7
      const map = L.map(mapRef.current, { zoomControl: false }).setView(initialCenter, initialZoom)

      // Tile layers
      setupTileLayers(L, map, satelliteRef.current)

      mapInstanceRef.current = map
      map.on('moveend zoomend', () => {
        const center = map.getCenter()
        savedMapView = { center: [center.lat, center.lng], zoom: map.getZoom() }
      })
      addMarkers(L, hostsRef.current)

      map.locate({ setView: false, maxZoom: 11 })
      map.on('locationfound', (e: any) => {
        // "You" dot
        const youIcon = L.divIcon({
          html: `<div style="width:14px;height:14px;background:${C.text};border:3px solid ${C.accent};border-radius:50%;box-shadow:0 0 0 5px ${C.accent}33;"></div>`,
          className: '', iconSize: [14, 14], iconAnchor: [7, 7],
        })
        L.marker([e.latlng.lat, e.latlng.lng], { icon: youIcon, zIndexOffset: 2000 }).addTo(map)
      })
    })

    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
      markersRef.current = []; circlesRef.current = []; overlayLayersRef.current = []
    }
  }, [])

  useFocusEffect(useCallback(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100)
    }
  }, []))

  useEffect(() => {
    if (!mapInstanceRef.current) return
    import('leaflet').then(mod => addMarkers(mod.default, hosts))
  }, [hosts, buddyIds])

  function setupTileLayers(L: any, map: any, isSatellite: boolean) {
    if (tileLayerRef.current) tileLayerRef.current.remove()
    overlayLayersRef.current.forEach(l => l.remove())
    overlayLayersRef.current = []

    if (isSatellite) {
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
      ).addTo(map)
      overlayLayersRef.current = [
        L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 19, opacity: 0.9 }
        ).addTo(map),
        L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 19 }
        ).addTo(map),
      ]
    } else {
      tileLayerRef.current = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 19 }
      ).addTo(map)
    }
  }

  useEffect(() => {
    if (!mapInstanceRef.current) return
    import('leaflet').then(mod => setupTileLayers(mod.default, mapInstanceRef.current, satellite))
  }, [satellite])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div ref={mapRef as any} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      {/* Satellite toggle — top-right */}
      {onSatelliteToggle && (
        <button
          onClick={onSatelliteToggle}
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 1000,
            background: satellite ? C.accent : C.surface,
            border: `2px solid ${satellite ? C.accent : C.border}`,
            borderRadius: 100, padding: '9px 16px',
            color: satellite ? C.white : C.textMuted,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          }}
        >
          🛰 Satellite
        </button>
      )}

      {/* Near me — bottom-right */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (!mapInstanceRef.current || locating) return
          if (!navigator.geolocation) { setLocateError('Geolocation not supported'); return }
          setLocating(true)
          setLocateError('')
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude: lat, longitude: lng } = pos.coords
              mapInstanceRef.current?.setView([lat, lng], 13)
              setLocating(false)
            },
            () => {
              setLocateError('Location access denied')
              setLocating(false)
            },
            { timeout: 10000, enableHighAccuracy: true }
          )
        }}
        style={{
          position: 'absolute', bottom: 80, right: 16, zIndex: 1000,
          background: C.surface, border: `2px solid ${C.accent}`,
          borderRadius: 100, padding: '10px 16px',
          color: C.text, fontWeight: 700, fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 16px rgba(0,0,0,0.2)',
          opacity: locating ? 0.7 : 1,
        }}
      >
        📍 {locating ? 'Locating...' : locateError || 'Near me'}
      </button>
    </div>
  )
}
