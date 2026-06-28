// Rewrites a Supabase public-object URL to the on-the-fly image-transform (render)
// endpoint, so lists/thumbnails fetch a small resized image instead of the full-res
// original (often multiple MB). Full resolution is kept for fullscreen viewers by
// simply not calling this. Non-Supabase or already-transformed URLs pass through.
const OBJECT_MARKER = '/storage/v1/object/public/'

export function thumbnailUrl(url: string | null | undefined, px: number, quality = 70): string | undefined {
  if (!url) return undefined
  const i = url.indexOf(OBJECT_MARKER)
  if (i === -1) return url // not a Supabase public-object URL — leave as-is
  const base = url.slice(0, i)
  const after = url.slice(i + OBJECT_MARKER.length)
  const [path, query = ''] = after.split('?')
  // Preserve an existing cache-buster (e.g. ?t=…), append the transform params.
  const keep = query.split('&').filter(p => p && !/^(width|height|quality|resize)=/.test(p))
  keep.push(`width=${px}`, `height=${px}`, `resize=cover`, `quality=${quality}`)
  return `${base}/storage/v1/render/image/public/${path}?${keep.join('&')}`
}
