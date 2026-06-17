import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import L from 'leaflet'
import 'leaflet.markercluster'  // side-effect: patches the same L with markerClusterGroup
import { useTheme } from '../lib/ThemeContext'

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

function injectCss(id: string, href: string) {
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id; link.rel = 'stylesheet'; link.href = href
  document.head.appendChild(link)
}

function injectLeafletCSS() {
  injectCss('leaflet-css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')
  injectCss('leaflet-markercluster-css', 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css')
}

export default function HostMap({
  hosts,
  onHostSelect,
  satellite = false,
  onSatelliteToggle,
}: {
  hosts: Host[]
  onHostSelect: (host: Host) => void
  satellite?: boolean
  onSatelliteToggle?: () => void
}) {
  const C = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const circlesRef = useRef<any[]>([])
  const clusterRef = useRef<any>(null)
  const hostsRef = useRef(hosts); hostsRef.current = hosts
  const satelliteRef = useRef(satellite)
  const tileLayerRef = useRef<any>(null)
  const overlayLayersRef = useRef<any[]>([])
  satelliteRef.current = satellite
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')

  function addMarkers(currentHosts: Host[]) {
    const map = mapInstanceRef.current
    const cluster = clusterRef.current
    if (!map || !cluster) return
    cluster.clearLayers()
    markersRef.current = []
    circlesRef.current.forEach(c => c.remove())
    circlesRef.current = []

    currentHosts.forEach(host => {
      if (!host.location_lat || !host.location_lng) return
      const pinColor = C.accent
      const size = 38
      const circle = L.circle([host.location_lat, host.location_lng], {
        radius: 500,
        color: C.accent,
        fill: false,
        dashArray: '8 6',
        weight: 2,
        opacity: 0.45,
      }).addTo(map)
      circlesRef.current.push(circle)

      const avatarInner = host.profiles?.avatar_url
        ? `<img src="${host.profiles.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;">${host.profiles?.full_name ? host.profiles.full_name[0].toUpperCase() : '?'}</div>`

      const totalH = size + 8  // circle + arrow
      const markerHtml = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="
            width:${size}px;height:${size}px;
            background:${pinColor};
            border-radius:50%;
            border:2.5px solid #fff;
            box-shadow:0 2px 10px rgba(0,0,0,0.35);
            overflow:hidden;
            flex-shrink:0;
          ">
            ${avatarInner}
          </div>
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${pinColor};"></div>
        </div>
      `

      const markerIcon = L.divIcon({
        html: markerHtml,
        className: '',
        iconSize: [90, totalH],
        iconAnchor: [45, totalH],
      })

      const marker = L.marker([host.location_lat, host.location_lng], { icon: markerIcon })
        .on('click', () => onHostSelect(host))
      cluster.addLayer(marker)

      markersRef.current.push(marker)
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return
    let cancelled = false
    injectLeafletCSS()

    {
      const initialCenter = savedMapView?.center ?? [49.5, 15.5]
      const initialZoom = savedMapView?.zoom ?? 7
      const map = L.map(mapRef.current, { zoomControl: false }).setView(initialCenter as any, initialZoom)

      // Tile layers
      setupTileLayers(map, satelliteRef.current)

      mapInstanceRef.current = map

      // Cluster overlapping hosts into count bubbles ("3+", "10+", "20+");
      // individual avatars appear once zoomed in enough to separate them.
      clusterRef.current = (L as any).markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 55,
        iconCreateFunction: (cl: any) => {
          const n = cl.getChildCount()
          const label = n >= 20 ? '20+' : n >= 10 ? '10+' : n >= 3 ? '3+' : String(n)
          const sz = n >= 20 ? 52 : n >= 10 ? 46 : 40
          return L.divIcon({
            html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${C.accent};border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${n >= 10 ? 15 : 14}px;">${label}</div>`,
            className: '',
            iconSize: [sz, sz],
          })
        },
      })
      map.addLayer(clusterRef.current)

      map.on('moveend zoomend', () => {
        if (cancelled || mapInstanceRef.current !== map) return
        const center = map.getCenter()
        savedMapView = { center: [center.lat, center.lng], zoom: map.getZoom() }
      })
      addMarkers(hostsRef.current)

      map.locate({ setView: false, maxZoom: 11 })
      map.on('locationfound', (e: any) => {
        if (cancelled || mapInstanceRef.current !== map) return
        // "You" dot
        const youIcon = L.divIcon({
          html: `<div style="width:14px;height:14px;background:${C.text};border:3px solid ${C.accent};border-radius:50%;box-shadow:0 0 0 5px ${C.accent}33;"></div>`,
          className: '', iconSize: [14, 14], iconAnchor: [7, 7],
        })
        L.marker([e.latlng.lat, e.latlng.lng], { icon: youIcon, zIndexOffset: 2000 }).addTo(map)
      })
    }

    return () => {
      cancelled = true
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
      markersRef.current = []; circlesRef.current = []; overlayLayersRef.current = []; clusterRef.current = null
    }
	  // Leaflet owns the mounted map instance; this effect should run once and then use refs for live values.
	  // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [])

  useFocusEffect(useCallback(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100)
    }
  }, []))

  useEffect(() => {
    if (mapInstanceRef.current) addMarkers(hosts)
    return () => {}
	  // Repaint markers when host inputs change; addMarkers reads the latest theme and callbacks through component scope.
	  // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [hosts])

  function setupTileLayers(map: any, isSatellite: boolean) {
    if (!map) return
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
    const map = mapInstanceRef.current
    if (map) setupTileLayers(map, satellite)
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
