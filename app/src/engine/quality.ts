// Umbrales de calidad de foto fijados por la spec (§4.3), no por el paquete.
export const MIN_BRIGHTNESS = 40;
export const MAX_BRIGHTNESS = 230;
export const MIN_LAPLACIAN_VAR = 60;
export const QUALITY_SIZE = 224;

/** RGBA -> luma (0.299R + 0.587G + 0.114B), un valor por píxel. */
export function toGray(rgba: Uint8ClampedArray): Float32Array {
  const n = Math.floor(rgba.length / 4);
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] = 0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0);
  }
  return gray;
}

export function meanBrightness(gray: Float32Array): number {
  if (gray.length === 0) return 0;
  let s = 0;
  for (const v of gray) s += v;
  return s / gray.length;
}

/** Varianza poblacional del Laplaciano de 4 vecinos sobre los píxeles interiores. */
export function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = (gray[i - 1] ?? 0) + (gray[i + 1] ?? 0) + (gray[i - w] ?? 0) + (gray[i + w] ?? 0) - 4 * (gray[i] ?? 0);
      sum += l;
      sumSq += l * l;
      n++;
    }
  }
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

export function assessQuality(rgba: Uint8ClampedArray, w: number, h: number): 'ok' | 'bad_photo' {
  const gray = toGray(rgba);
  const b = meanBrightness(gray);
  if (b < MIN_BRIGHTNESS || b > MAX_BRIGHTNESS) return 'bad_photo';
  if (laplacianVariance(gray, w, h) < MIN_LAPLACIAN_VAR) return 'bad_photo';
  return 'ok';
}

/** Solo navegador: dibuja la imagen estirada (sin recorte) a size x size y devuelve sus píxeles RGBA. */
export function imageToRgba(image: ImageBitmap, size = QUALITY_SIZE): Uint8ClampedArray {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(image, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}
