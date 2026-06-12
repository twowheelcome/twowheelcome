import { useEffect, useRef, useState } from 'react'
import { C, SAFETY, SPEED } from '../lib/theme'

// Map DB parking keys → SAFETY keys
const DB_TO_SAFETY: Record<string, keyof typeof SAFETY> = {
  garage_locked: 'locked_garage',
  locked_garage: 'locked_garage',
  carport:       'carport',
  yard:          'fenced_yard',
  fenced_yard:   'fenced_yard',
  street:        'street',
}

interface Host {
  id: string
  location_lat: number
  location_lng: number
  location_city: string
  location_country: string
  parking: string
  parkings?: string[]
  pricing: string
  profiles: { full_name: string } | null
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function etaLabel(km: number, mode: 'road' | 'trail'): string {
  const mins = Math.round((km / SPEED[mode]) * 60)
  if (mins < 60) return `~${mins} min`
  const h = Math.floor(mins / 60); const m = mins % 60
  return m ? `~${h}h ${m}m` : `~${h}h`
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
  mode = 'road',
  buddyIds = [],
}: {
  hosts: Host[]
  onHostSelect: (host: Host) => void
  mode?: 'road' | 'trail'
  buddyIds?: string[]
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const circlesRef = useRef<any[]>([])
  const hostsRef = useRef(hosts); hostsRef.current = hosts
  const modeRef = useRef(mode); modeRef.current = mode
  const buddyRef = useRef(buddyIds); buddyRef.current = buddyIds
  const userPosRef = useRef<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

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
      const pinColor = isBuddy ? C.buddy : safety.color
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

      // ETA if user location known
      let etaStr = ''
      if (userPosRef.current) {
        const km = haversineKm(userPosRef.current.lat, userPosRef.current.lng, host.location_lat, host.location_lng)
        etaStr = `${etaLabel(km, modeRef.current)} · ${km.toFixed(0)} km`
      }

      const buddyStar = isBuddy ? `<div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:14px;line-height:1;">⭐</div>` : ''

      const markerHtml = `
        <div style="position:relative;width:${size}px;height:${size}px;">
          ${buddyStar}
          <div style="
            position:absolute;inset:0;
            background:${pinColor};
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            border:2.5px solid ${isBuddy ? C.buddy : C.white};
            box-shadow:0 2px 10px rgba(0,0,0,0.6);
            cursor:pointer;
          ">
            <div style="transform:rotate(45deg);display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:${isBuddy ? 18 : 15}px;">
              ${safety.icon}
            </div>
          </div>
        </div>
      `

      const markerIcon = L.divIcon({
        html: markerHtml,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
      });

      (window as any).__twwHandlers[host.id] = () => onHostSelect(host)

      const privacyLine = isBuddy
        ? `<div style="font-size:11px;color:${C.buddy};margin-top:4px;">⭐ You've stayed here · exact address saved</div>`
        : `<div style="font-size:11px;color:${C.textDim};margin-top:4px;">🔒 Approx. area — unlocks on accept</div>`

      const popupContent = `
        <div style="font-family:-apple-system,sans-serif;min-width:190px;">
          <div style="font-weight:700;font-size:14px;color:${C.text};">${host.profiles?.full_name || 'Rider'}${isBuddy ? ' ⭐' : ''}</div>
          <div style="color:${C.textDim};font-size:12px;margin-top:2px;">🏍 📍 ${host.location_city}</div>
          ${etaStr ? `<div style="color:${C.accent};font-size:15px;font-weight:700;margin:6px 0 0;">${etaStr.split('·')[0].trim()}</div><div style="color:${C.textDim};font-size:11px;margin-bottom:4px;">${etaStr.split('·')[1]?.trim() || ''} · ${modeRef.current}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;background:${safety.color}18;border:1px solid ${safety.color}55;border-radius:8px;padding:6px 8px;margin:6px 0 4px;">
            <span style="font-size:16px;">${safety.icon}</span>
            <div>
              <div style="color:${safety.color};font-weight:700;font-size:12px;">${safety.label}</div>
              <div style="color:${C.textDim};font-size:10px;">${safety.sub}</div>
            </div>
          </div>
          ${privacyLine}
          <button onclick="window.__twwHandlers['${host.id}']()"
            style="margin-top:8px;background:${C.accent};color:white;border:none;padding:9px 14px;border-radius:100px;cursor:pointer;width:100%;font-weight:700;font-size:12px;letter-spacing:1px;">
            KNOCK ON THE DOOR →
          </button>
        </div>
      `

      const marker = L.marker([host.location_lat, host.location_lng], { icon: markerIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(popupContent, { className: 'tww-popup', maxWidth: 230 })

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
      const map = L.map(mapRef.current, { zoomControl: false }).setView([49.5, 15.5], 7)

      // Dark tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapInstanceRef.current = map
      addMarkers(L, hostsRef.current)

      map.locate({ setView: true, maxZoom: 11 })
      map.on('locationfound', (e: any) => {
        userPosRef.current = { lat: e.latlng.lat, lng: e.latlng.lng }
        // "You" dot
        const youIcon = L.divIcon({
          html: `<div style="width:14px;height:14px;background:${C.text};border:3px solid ${C.accent};border-radius:50%;box-shadow:0 0 0 5px ${C.accent}33;"></div>`,
          className: '', iconSize: [14, 14], iconAnchor: [7, 7],
        })
        L.marker([e.latlng.lat, e.latlng.lng], { icon: youIcon, zIndexOffset: 2000 }).addTo(map)
        import('leaflet').then(m => addMarkers(m.default, hostsRef.current))
      })
    })

    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
      markersRef.current = []; circlesRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current) return
    import('leaflet').then(mod => addMarkers(mod.default, hosts))
  }, [hosts, mode, buddyIds])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div ref={mapRef as any} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <button
        onClick={() => {
          if (!mapInstanceRef.current) return
          setLocating(true)
          const map = mapInstanceRef.current
          map.once('locationfound', () => setLocating(false))
          map.once('locationerror', () => setLocating(false))
          map.locate({ setView: true, maxZoom: 12 })
        }}
        style={{
          position: 'absolute', bottom: 80, right: 16, zIndex: 1000,
          background: C.surface, border: `2px solid ${C.accent}`,
          borderRadius: 100, padding: '10px 16px',
          color: C.text, fontWeight: 700, fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 16px rgba(0,0,0,0.6)',
          opacity: locating ? 0.7 : 1,
        }}
      >
        📍 {locating ? 'Locating...' : 'Near me'}
      </button>
    </div>
  )
}
