import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../lib/ThemeContext'

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

function markerIcon(L: any, accent: string) {
  return L.divIcon({
    html: `<div style="
      background:${accent};width:32px;height:32px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);color:white;font-size:14px;">📍</span></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })
}

export default function LocationPicker({ pin, onChange }: Props) {
  const C = useTheme()

  // Inline (read-only preview) map
  const previewRef = useRef<HTMLDivElement>(null)
  const previewMapRef = useRef<any>(null)
  const previewMarkerRef = useRef<any>(null)
  const pinRef = useRef<Pin | null>(pin)

  // Fullscreen editor map
  const fsRef = useRef<HTMLDivElement>(null)
  const fsMapRef = useRef<any>(null)
  const fsMarkerRef = useRef<any>(null)
  const draftRef = useRef<Pin | null>(null)   // working pin while editing; committed only on "Set"

  const [fullscreen, setFullscreen] = useState(false)
  const [draftPin, setDraftPin] = useState<Pin | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const searchTimeout = useRef<any>(null)

  function placeMarker(L: any, map: any, holder: { current: any }, lat: number, lng: number) {
    if (holder.current) { holder.current.remove(); holder.current = null }
    holder.current = L.marker([lat, lng], { icon: markerIcon(L, C.accent) }).addTo(map)
  }

  useEffect(() => { pinRef.current = pin }, [pin])

  // ── Inline read-only preview map (never interactive — scroll-safe) ──────────
  useEffect(() => {
    if (typeof window === 'undefined' || !previewRef.current || previewMapRef.current) return
    injectLeafletCSS()
    import('leaflet').then(mod => {
      if (!previewRef.current || previewMapRef.current) return
      const L = mod.default
      const start = pinRef.current
      const map = L.map(previewRef.current, {
        zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false, attributionControl: false,
        ...(L.Browser?.touch ? { tap: false } : {}),
      }).setView(start ? [start.lat, start.lng] : [49.8, 15.5], start ? 12 : 6)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
      previewMapRef.current = map
      if (start) placeMarker(L, map, previewMarkerRef, start.lat, start.lng)
    })
    return () => {
      if (previewMapRef.current) { previewMapRef.current.remove(); previewMapRef.current = null }
      previewMarkerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the preview in sync with the committed pin (e.g. after "Set" or DB load).
  useEffect(() => {
    if (!previewMapRef.current || !pin) return
    import('leaflet').then(mod => {
      placeMarker(mod.default, previewMapRef.current, previewMarkerRef, pin.lat, pin.lng)
      previewMapRef.current.setView([pin.lat, pin.lng], 12)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.lat, pin?.lng])

  // ── Fullscreen editor map (created on open, destroyed on close) ─────────────
  useEffect(() => {
    if (!fullscreen) return
    let cancelled = false
    injectLeafletCSS()
    import('leaflet').then(mod => {
      if (cancelled || !fsRef.current || fsMapRef.current) return
      const L = mod.default
      const start = draftRef.current
      const map = L.map(fsRef.current, { zoomControl: true })
        .setView(start ? [start.lat, start.lng] : [49.8, 15.5], start ? 14 : 6)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18,
      }).addTo(map)
      fsMapRef.current = map
      if (start) placeMarker(L, map, fsMarkerRef, start.lat, start.lng)
      map.on('click', async (e: any) => {
        const { lat, lng } = e.latlng
        placeMarker(L, map, fsMarkerRef, lat, lng)
        const geo = await reverseGeocode(lat, lng)
        const next = { lat, lng, ...geo }
        draftRef.current = next
        setDraftPin(next)
      })
      setTimeout(() => map.invalidateSize(), 60)
    })
    return () => {
      cancelled = true
      if (fsMapRef.current) { fsMapRef.current.remove(); fsMapRef.current = null }
      fsMarkerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen])

  // Lock background scroll while the fullscreen editor is open.
  useEffect(() => {
    if (typeof document === 'undefined' || !fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [fullscreen])

  function openFullscreen() {
    draftRef.current = pinRef.current
    setDraftPin(pinRef.current)
    setQuery(''); setResults([])
    setFullscreen(true)
  }
  function confirmFullscreen() {
    if (draftRef.current) onChange(draftRef.current)
    setFullscreen(false)
  }

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

  function applyDraft(L: any, lat: number, lng: number, geo: { city: string; country: string }) {
    const map = fsMapRef.current
    if (map) { placeMarker(L, map, fsMarkerRef, lat, lng); map.setView([lat, lng], 14) }
    const next = { lat, lng, ...geo }
    draftRef.current = next
    setDraftPin(next)
  }

  async function locateMe() {
    if (!navigator.geolocation || locating) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        const geo = await reverseGeocode(lat, lng)
        const mod = await import('leaflet')
        applyDraft(mod.default, lat, lng, geo)
        setQuery(geo.city || `${lat.toFixed(4)}, ${lng.toFixed(4)}`)
        setLocating(false)
      },
      () => setLocating(false),
      { timeout: 10000 }
    )
  }

  async function selectResult(result: SearchResult) {
    const lat = parseFloat(result.lat)
    const lng = parseFloat(result.lon)
    const geo = await reverseGeocode(lat, lng)
    const mod = await import('leaflet')
    applyDraft(mod.default, lat, lng, geo)
    setQuery(result.display_name.split(',').slice(0, 2).join(','))
    setResults([])
  }

  return (
    <>
      {/* Inline, non-interactive preview — tap to open the fullscreen editor */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div ref={previewRef as any} style={{ width: '100%', height: '100%' }} />
        <div
          onClick={openFullscreen}
          style={{
            position: 'absolute', inset: 0, zIndex: 1200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', background: 'rgba(0,0,0,0.05)',
          }}
        >
          <div style={{
            pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 8,
            background: C.accent, color: '#fff', fontWeight: 800, fontSize: 13,
            padding: '11px 18px', borderRadius: 100, boxShadow: '0 2px 14px rgba(0,0,0,0.35)',
            fontFamily: 'sans-serif',
          }}>
            <span style={{ fontSize: 15 }}>📍</span>{pin ? 'Tap to adjust on full map' : 'Tap to set the location'}
          </div>
        </div>
      </div>

      {/* Fullscreen editor (portal so it escapes the form layout) */}
      {fullscreen && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          display: 'flex', flexDirection: 'column', background: C.bg,
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: C.elevated, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ padding: '0 12px', fontSize: 14, color: C.textFaint }}>🔍</span>
              <input
                type="text"
                value={query}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="Search address…"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 16, padding: '14px 0', fontFamily: 'sans-serif' }}
              />
              {searching && <span style={{ padding: '0 10px', color: C.textFaint, fontSize: 11 }}>…</span>}
              {query && !searching && (
                <button onClick={() => { setQuery(''); setResults([]) }}
                  style={{ background: 'none', border: 'none', color: C.textFaint, cursor: 'pointer', padding: '0 12px', fontSize: 14 }}>✕</button>
              )}
            </div>
            {results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.elevated, borderBottom: `1px solid ${C.borderMid}`, zIndex: 2000, maxHeight: 240, overflowY: 'auto' }}>
                {results.map((r, i) => (
                  <button key={i} onClick={() => selectResult(r)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`, color: C.text, padding: '11px 14px', cursor: 'pointer', fontSize: 13, fontFamily: 'sans-serif', lineHeight: 1.4 }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.hover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    {r.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Use my location */}
          <button onClick={locateMe} disabled={locating}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', flexShrink: 0, background: C.accentSoft, border: 'none', borderBottom: `1px solid ${C.border}`, color: C.accent, fontWeight: 800, fontSize: 13, fontFamily: 'sans-serif', padding: '12px 14px', cursor: locating ? 'default' : 'pointer', opacity: locating ? 0.6 : 1 }}>
            <span style={{ fontSize: 15 }}>📍</span>{locating ? 'Getting your location…' : 'Use my current location'}
          </button>

          {/* Map */}
          <div style={{ position: 'relative', flex: 1 }}>
            <div ref={fsRef as any} style={{ width: '100%', height: '100%' }} />
            <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(26,34,41,0.88)', color: '#fff', fontSize: 12, padding: '5px 12px', borderRadius: 20, zIndex: 1000, pointerEvents: 'none', whiteSpace: 'nowrap', fontFamily: 'sans-serif' }}>
              Tap the map to drop the pin · drag/zoom to fine-tune
            </div>
          </div>

          {/* Footer: cancel / confirm */}
          <div style={{ display: 'flex', gap: 10, padding: 12, background: C.surface, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <button onClick={() => setFullscreen(false)}
              style={{ flex: 1, background: C.elevated, border: `1px solid ${C.border}`, color: C.text, fontWeight: 700, fontSize: 14, fontFamily: 'sans-serif', padding: '13px 0', borderRadius: 100, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={confirmFullscreen} disabled={!draftPin}
              style={{ flex: 1, background: draftPin ? C.accent : C.border, border: 'none', color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: 'sans-serif', padding: '13px 0', borderRadius: 100, cursor: draftPin ? 'pointer' : 'default' }}>
              ✓ Set location
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
