// Umbrales de calidad de foto fijados por la spec (§4.3), no por el paquete.
export const MIN_BRIGHTNESS = 40;
export const MAX_BRIGHTNESS = 230;
// Recalibrado con fotos reales de campo (Uganda y Perú, 140 fotos): con 60 se rechazaba el 36 % de fotos nítidas de
// hojas (superficies lisas en primer plano); con 20 se acepta el 86 % y se sigue rechazando el 97 % de las mismas
// fotos desenfocadas (σ = 1,5 px a 224 px). Ver docs/DECISIONES.md.
export const MIN_LAPLACIAN_VAR = 20;
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
// Reducción con suavizado, como PIL (BILINEAR) en el entrenamiento y la calibración. Un solo drawImage de una foto de
// 12 MP a 224 px casi no filtra: deja aliasing que multiplica ~5 veces la varianza del Laplaciano (textura) y hacía que
// fotos reales de hojas fallaran el filtro de hoja (max_texture_var). Se reduce a la mitad por pasos y al final al tamaño.
export function imageToRgba(image: ImageBitmap, size = QUALITY_SIZE): Uint8ClampedArray {
  let src: CanvasImageSource = image;
  let w = image.width;
  let h = image.height;
  while (w >= size * 2 || h >= size * 2) {
    const nw = Math.max(size, Math.round(w / 2));
    const nh = Math.max(size, Math.round(h / 2));
    const step = context2d(nw, nh);
    step.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
    src = step.canvas;
    w = nw;
    h = nh;
  }
  const ctx = context2d(size, size);
  ctx.drawImage(src, 0, 0, w, h, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

function context2d(w: number, h: number): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}
