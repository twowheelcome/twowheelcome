import { Platform } from 'react-native'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { File as FsFile } from 'expo-file-system'
import { decode } from 'base64-arraybuffer'

// Client-side downscale + JPEG compress before upload, so a 3–12 MB phone photo becomes
// ~150–400 KB. Works on web AND native, and — importantly — never hangs.
//
// WEB: decode with createImageBitmap (async, REJECTS on failure — unlike an <img> from a big
//   data: URL, which on iOS Safari can neither load nor error and hangs forever). Draw straight
//   onto a canvas sized to the target dimensions, then canvas.toBlob JPEG. Fallback path uses an
//   <img> via an object URL (NOT a data URL) with a timeout. If neither can decode the photo we
//   throw UNPROCESSABLE so the caller can show a clear message. Body = Blob.
// NATIVE: ImageManipulator resize → read the result as base64 → ArrayBuffer (a RN Blob body
//   hangs on upload). Body = ArrayBuffer.
//
// Callers pass a web File (from <input type=file>) or a PickedImage ({ uri, width, height })
// from expo-image-picker, and upload the returned `data` with the returned `contentType`.
const MAX_SIDE = 1400
const QUALITY = 0.7
const IMG_DECODE_TIMEOUT_MS = 20000

export type PickedImage = { uri: string; width: number; height: number }
export type UploadBody = { data: ArrayBuffer | Blob; contentType: string }
export const UNPROCESSABLE = 'unprocessable-image'

// Generic timeout wrapper so a never-settling promise can't hang the UI. Rejects with `message`.
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

// Draw any decoded image source onto a canvas scaled to <= MAX_SIDE, encode JPEG. (web only)
async function encodeJpeg(source: CanvasImageSource, srcW: number, srcH: number): Promise<Blob> {
  const longest = Math.max(srcW, srcH)
  const scale = longest > MAX_SIDE ? MAX_SIDE / longest : 1
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(UNPROCESSABLE)
  ctx.drawImage(source, 0, 0, w, h)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob || blob.size === 0) throw new Error(UNPROCESSABLE)
  return blob
}

// Fallback: decode via <img> from an object URL (not a data URL) with a hard timeout. (web only)
function encodeViaImgTag(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const timer = setTimeout(() => { cleanup(); reject(new Error(UNPROCESSABLE)) }, IMG_DECODE_TIMEOUT_MS)
    function cleanup() { clearTimeout(timer); URL.revokeObjectURL(url) }
    img.onload = () => {
      encodeJpeg(img, img.naturalWidth, img.naturalHeight).then(
        blob => { cleanup(); resolve(blob) },
        err => { cleanup(); reject(err) },
      )
    }
    img.onerror = () => { cleanup(); reject(new Error(UNPROCESSABLE)) }
    img.src = url
  })
}

async function compressWeb(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      return await encodeJpeg(bitmap, bitmap.width, bitmap.height)
    } finally {
      bitmap.close?.()
    }
  } catch {
    // createImageBitmap couldn't decode it (e.g. some HEIC on older Safari) — try the <img> path.
    return await encodeViaImgTag(file)
  }
}

// Native: turn a local file URI into an ArrayBuffer body (base64 → decode).
async function nativeBody(uri: string, contentType = 'image/jpeg'): Promise<UploadBody> {
  const base64 = await new FsFile(uri).base64()
  return { data: decode(base64), contentType }
}

export async function compressBikePhoto(input: File | PickedImage): Promise<UploadBody> {
  if (Platform.OS === 'web') {
    const blob = await compressWeb(input as Blob)
    return { data: blob, contentType: blob.type || 'image/jpeg' }
  }
  // Native
  const pic = input as PickedImage
  try {
    const longest = Math.max(pic.width, pic.height)
    const context = ImageManipulator.manipulate(pic.uri)
    if (longest > MAX_SIDE) {
      if (pic.width >= pic.height) context.resize({ width: MAX_SIDE })
      else context.resize({ height: MAX_SIDE })
    }
    const image = await context.renderAsync()
    const result = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG })
    return await nativeBody(result.uri)
  } catch (e) {
    console.warn('bike photo compression failed, uploading original:', e)
    return await nativeBody(pic.uri)
  }
}
