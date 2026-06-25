import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

// Client-side downscale + JPEG compress before upload, so a 2–5 MB phone photo becomes
// ~100–300 KB. Best-effort: any failure falls back to the original file, so a knock photo
// always still uploads. The request photo is only picked on web today, but this works
// cross-platform if native picking is added later.
const MAX_SIDE = 1400
const QUALITY = 0.7

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function readDimensions(file: Blob): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const dims = { w: bmp.width, h: bmp.height }
    bmp.close?.()
    return dims
  } catch {
    return { w: 0, h: 0 }
  }
}

export async function compressBikePhoto(file: File): Promise<Blob> {
  try {
    const dataUrl = await fileToDataUrl(file)
    const { w, h } = await readDimensions(file)
    const context = ImageManipulator.manipulate(dataUrl)
    // Resize the longest side down to MAX_SIDE (only when it's actually larger).
    const longest = Math.max(w, h)
    if (longest > MAX_SIDE) {
      if (w >= h) context.resize({ width: MAX_SIDE })
      else context.resize({ height: MAX_SIDE })
    }
    const image = await context.renderAsync()
    const result = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG })
    const blob = await (await fetch(result.uri)).blob()
    // Keep the compressed copy only if it really came out smaller.
    return blob.size > 0 && blob.size < file.size ? blob : file
  } catch (e) {
    console.warn('bike photo compression failed, uploading original:', e)
    return file
  }
}
