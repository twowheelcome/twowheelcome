import { useEffect, useRef } from 'react'

interface Host {
  id: string
  location_lat: number
  location_lng: number
  location_city: string
  location_country: string
  parking: string
  pricing: string
  profiles: { full_name: string } | null
}

const parkingColors: Record<string, string> = {
  garage_locked: '#22c55e',
  carport: '#3b82f6',
  yard: '#e8631a',
  street: '#94a3b8',
}

const parkingIcons: Record<string, string> = {
  garage_locked: '🔒',
  carport: '🔐',
  yard: '🛡',
  street: '🛣',
}

function injectLeafletCSS() {
  if (document.getElementById('leaflet-css')) return
  const link = document.createElement('link')
  link.id = 'leaflet-css'
  link.rel = 'stylesheet'
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
  document.head.appendChild(link)
}

export default function HostMap({ hosts, onHostSelect }: { hosts: Host[]; onHostSelect: (host: Host) => void }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  // keeps latest hosts accessible from async callbacks without stale closure
  const hostsRef = useRef<Host[]>(hosts)
  hostsRef.current = hosts

  function addMarkers(L: any, currentHosts: Host[]) {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    ;(window as any).__twwHandlers = {}

    currentHosts.forEach(host => {
      if (!host.location_lat || !host.location_lng) return
      const color = parkingColors[host.parking] || '#94a3b8'
      const icon = parkingIcons[host.parking] || '📍'

      const markerIcon = L.divIcon({
        html: `<div style="background:${color};width:36px;height:36px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;">${icon}</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      ;(window as any).__twwHandlers[host.id] = () => onHostSelect(host)

      const marker = L.marker([host.location_lat, host.location_lng], { icon: markerIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:160px;">
            <b style="font-size:14px;">${host.profiles?.full_name || 'Jezdec'}</b><br>
            <span style="color:#666;font-size:12px;">📍 ${host.location_city}, ${host.location_country}</span><br>
            <span style="font-size:12px;">${icon} ${host.parking}</span><br>
            <button
              onclick="window.__twwHandlers['${host.id}']()"
              style="margin-top:8px;background:#e8631a;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;width:100%;font-weight:700;font-size:12px;letter-spacing:1px;"
            >KLEPU NA DVEŘE →</button>
          </div>
        `)

      markersRef.current.push(marker)
    })
  }

  // initialize map once on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return

    injectLeafletCSS()

    import('leaflet').then(mod => {
      if (!mapRef.current) return
      const L = mod.default
      const map = L.map(mapRef.current, { zoomControl: true }).setView([49.5, 15.5], 6)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map)
      mapInstanceRef.current = map
      // use hostsRef so we get the latest hosts even if they arrived before map init
      addMarkers(L, hostsRef.current)
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      markersRef.current = []
    }
  }, [])

  // re-draw markers when hosts change (after map is ready)
  useEffect(() => {
    if (!mapInstanceRef.current) return
    import('leaflet').then(mod => addMarkers(mod.default, hosts))
  }, [hosts])

  return (
    <div
      ref={mapRef as any}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  )
}
