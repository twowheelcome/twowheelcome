import { useEffect, useRef, useState } from 'react'

export interface Pin {
  lat: number
  lng: number
  city?: string
  country?: string
}

interface Props {
  pin: Pin | null
  onChange: (pin: Pin) => void
}

function injectLeafletCSS() {
  if (document.getElementById('leaflet-css')) return
  const link = document.createElement('link')
  link.id = 'leaflet-css'
  link.rel = 'stylesheet'
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
  document.head.appendChild(link)
}

async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; country: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    )
    const d = await res.json()
    const city = d.address?.city || d.address?.town || d.address?.village || d.address?.county || ''
    const country = d.address?.country_code?.toUpperCase() || ''
    return { city, country }
  } catch {
    return { city: '', country: '' }
  }
}

interface SearchResult {
  display_name: string
  lat: string
  lon: string
}

async function searchAddress(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`
    )
    return await res.json()
  } catch {
    return []
  }
}

export default function LocationPicker({ pin, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const pinRef = useRef<Pin | null>(pin)
  pinRef.current = pin

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<any>(null)

  function handleSearchInput(value: string) {
    setQuery(value)
    clearTimeout(searchTimeout.current)
    if (!value.trim()) { setResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const found = await searchAddress(value)
      setResults(found)
      setSearching(false)
    }, 400)
  }

  async function selectResult(result: SearchResult) {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    const geo = await reverseGeocode(lat, lng)
    const label = geo.city || result.display_name.split(',')[0]
    if (mapInstanceRef.current) {
      import('leaflet').then(mod => {
        setMarker(mod.default, lat, lng, label)
        mapInstanceRef.current.setView([lat, lng], 13)
      })
    }
    onChange({ lat, lng, ...geo })
    setQuery(result.display_name.split(',').slice(0, 2).join(','))
    setResults([])
  }

  function setMarker(L: any, lat: number, lng: number, label: string) {
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
    const icon = L.divIcon({
      html: `<div style="
        background:#e8631a;width:32px;height:32px;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;cursor:pointer;
      "><span style="transform:rotate(45deg);color:white;font-size:14px;">📍</span></div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    })
    markerRef.current = L.marker([lat, lng], { icon })
      .addTo(mapInstanceRef.current)
      .bindPopup(`<div style="font-family:sans-serif;font-size:13px;">${label}</div>`)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return
    injectLeafletCSS()

    import('leaflet').then(mod => {
      if (!mapRef.current) return
      const L = mod.default
      const center: [number, number] = pinRef.current
        ? [pinRef.current.lat, pinRef.current.lng]
        : [49.8, 15.5]
      const zoom = pinRef.current ? 12 : 6

      const map = L.map(mapRef.current, { zoomControl: true }).setView(center, zoom)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map)
      mapInstanceRef.current = map

      if (pinRef.current) {
        const label = pinRef.current.city || `${pinRef.current.lat.toFixed(4)}, ${pinRef.current.lng.toFixed(4)}`
        setMarker(L, pinRef.current.lat, pinRef.current.lng, label)
      }

      map.on('click', async (e: any) => {
        const { lat, lng } = e.latlng
        const geo = await reverseGeocode(lat, lng)
        const label = geo.city || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        setMarker(L, lat, lng, label)
        onChange({ lat, lng, ...geo })
      })
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      markerRef.current = null
    }
  }, [])

  // sync pin from outside (e.g. loaded from DB)
  useEffect(() => {
    if (!mapInstanceRef.current || !pin) return
    import('leaflet').then(mod => {
      const label = pin.city || `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`
      setMarker(mod.default, pin.lat, pin.lng, label)
      mapInstanceRef.current.setView([pin.lat, pin.lng], 12)
    })
  }, [pin?.lat, pin?.lng])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Search box */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', background: '#2d2d2d', borderBottom: '1px solid #333' }}>
          <span style={{ padding: '0 10px', fontSize: 14, color: '#555' }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Hledat adresu..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#eee', fontSize: 13, padding: '10px 0', fontFamily: 'sans-serif',
            }}
          />
          {searching && (
            <span style={{ padding: '0 10px', color: '#555', fontSize: 11 }}>...</span>
          )}
          {query && !searching && (
            <button
              onClick={() => { setQuery(''); setResults([]) }}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '0 10px', fontSize: 14 }}
            >✕</button>
          )}
        </div>
        {/* Výsledky */}
        {results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: '#2d2d2d', borderBottom: '1px solid #444',
            zIndex: 2000, maxHeight: 200, overflowY: 'auto',
          }}>
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => selectResult(r)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'none', border: 'none', borderBottom: '1px solid #333',
                  color: '#eee', padding: '9px 14px', cursor: 'pointer',
                  fontSize: 12, fontFamily: 'sans-serif', lineHeight: 1.4,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#383838')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mapa */}
      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={mapRef as any} style={{ width: '100%', height: '100%' }} />
        {!pin && (
          <div style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(26,26,26,0.85)', color: '#aaa', fontSize: 11,
            padding: '4px 10px', borderRadius: 20, zIndex: 1000, pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            Hledej adresu nebo klikni na mapu
          </div>
        )}
      </div>
    </div>
  )
}
