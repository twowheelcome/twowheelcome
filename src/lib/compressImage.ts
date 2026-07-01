import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

// Client-side downscale + JPEG compress before upload, so a 3–12 MB phone photo becomes
// ~150–400 KB. Works on web AND native: callers can pass either a web File or a PickedImage
// ({ uri, width, height }) carrying the picker's real pixel size. That size lets the resize
// run on native too — previously it relied on browser-only createImageBitmap, which silently
// skipped the downscale on native and left multi-MB uploads. Best-effort: any failure falls
// back to the original bytes, so a photo always still uploads.
const MAX_SIDE = 1400
const QUALITY = 0.7

export type PickedImage = { uri: string; width: number; height: number }

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Web only: turn a picked File into a PickedImage (data URL + pixel size via createImageBitmap).
async function webPickedImage(file: File): Promise<PickedImage> {
  const uri = await fileToDataUrl(file)
  let width = 0, height = 0
  try {
    const bmp = await createImageBitmap(file)
    width = bmp.width; height = bmp.height
    bmp.close?.()
  } catch { /* dimensions unknown → re-encode without resize */ }
  return { uri, width, height }
}

export async function compressBikePhoto(input: File | PickedImage): Promise<Blob> {
  const original: Blob | null = 'uri' in input ? null : input
  try {
    const pic: PickedImage = 'uri' in input ? input : await webPickedImage(input)
    const longest = Math.max(pic.width, pic.height)
    const context = ImageManipulator.manipulate(pic.uri)
    // Resize the longest side down to MAX_SIDE (only when it's actually larger).
    if (longest > MAX_SIDE) {
      if (pic.width >= pic.height) context.resize({ width: MAX_SIDE })
      else context.resize({ height: MAX_SIDE })
    }
    const image = await context.renderAsync()
    const result = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG })
    const blob = await (await fetch(result.uri)).blob()
    if (blob.size > 0) return blob
    return original ?? (await fetch(pic.uri)).blob()
  } catch (e) {
    console.warn('bike photo compression failed, uploading original:', e)
    return original ?? (await fetch((input as PickedImage).uri)).blob()
  }
}
