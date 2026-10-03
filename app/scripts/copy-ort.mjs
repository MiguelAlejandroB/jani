// Copia el runtime WASM de onnxruntime-web a public/ort/ (criterio 9: nada desde CDN).
// Solo el backend WASM básico; las variantes jsep/jspi/asyncify (WebGPU) no se usan.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, 'public', 'ort');
const files = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];

mkdirSync(dest, { recursive: true });
for (const f of files) {
  copyFileSync(join(src, f), join(dest, f));
  console.log(`ort: ${f} -> public/ort/`);
}
