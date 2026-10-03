// Dice qué archivos faltan para la demo: modelo y audios. Salida: 1 si falta algo.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..');
const modelDir = join(appRoot, 'public', 'models', 'arabica-v1');
const rel = (p) => p.slice(repoRoot.length + 1).split(sep).join('/');

let missing = 0;
const ok = (msg) => console.log(`  OK     ${msg}`);
const falta = (msg) => {
  missing++;
  console.log(`  FALTA  ${msg}`);
};
const isNums = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'number');

console.log('== MODELO (app/public/models/arabica-v1) ==');
const cardPath = join(modelDir, 'model_card.json');
if (!existsSync(cardPath)) {
  falta(`${rel(cardPath)} (ficha del modelo; la genera training/jani_train.ipynb)`);
} else {
  ok(rel(cardPath));
  let card = null;
  try {
    // Como la app: NaN / Infinity sueltos (json.dump de Python) se leen como null.
    const text = readFileSync(cardPath, 'utf8').replace(/(?<=[:[,]\s*)(-?Infinity|NaN)(?=\s*[,\]}])/g, 'null');
    card = JSON.parse(text);
  } catch {
    falta(`${rel(cardPath)} no es un JSON válido`);
  }
  if (card) {
    const checks = [
      ['classes (5 clases)', Array.isArray(card.classes) && card.classes.length === 5],
      ['input.mean (3 números)', isNums(card.input?.mean, 3)],
      ['input.std (3 números)', isNums(card.input?.std, 3)],
      ['temperature', typeof card.temperature === 'number'],
      ['unsure_rule.min_confidence', typeof card.unsure_rule?.min_confidence === 'number'],
      ['unsure_rule.min_margin', typeof card.unsure_rule?.min_margin === 'number'],
    ];
    for (const [name, pass] of checks) (pass ? ok : falta)(`model_card.json -> ${name}`);
    if (typeof card.recommended_file !== 'string' || card.recommended_file === '') {
      falta('model_card.json -> recommended_file está vacío (null = modo simulado; ponga el nombre del .onnx)');
    } else {
      ok('model_card.json -> recommended_file');
      const f = join(modelDir, card.recommended_file);
      if (!existsSync(f)) falta(`${rel(f)} (el archivo .onnx que nombra la ficha)`);
      else if (statSync(f).size >= 10 * 1024 * 1024) falta(`${rel(f)} pesa ${(statSync(f).size / 1048576).toFixed(1)} MB; debe pesar menos de 10 MB`);
      else ok(`${rel(f)} (${(statSync(f).size / 1048576).toFixed(1)} MB)`);
    }
  }
}

console.log('\n== AUDIOS DE LOS PAQUETES (packs/<id>/audio/<clave>.mp3) ==');
const packsDir = join(repoRoot, 'packs');
for (const id of readdirSync(packsDir).sort()) {
  const packFile = join(packsDir, id, 'pack.json');
  if (!existsSync(packFile)) continue;
  let pack;
  try {
    pack = JSON.parse(readFileSync(packFile, 'utf8'));
  } catch (e) {
    falta(`packs/${id}/pack.json no es un JSON válido (${e instanceof Error ? e.message : String(e)})`);
    continue;
  }
  const keys = Object.keys(pack.phrases ?? {});
  const absent = keys.filter((k) => !existsSync(join(packsDir, id, 'audio', `${k}.mp3`)));
  console.log(`\n[${id}] ${keys.length - absent.length} de ${keys.length} audios`);
  if (absent.length === 0) ok('todos los audios están');
  for (const k of absent) falta(`packs/${id}/audio/${k}.mp3`);
}

console.log(`\n== RESUMEN: ${missing === 0 ? 'OK, no falta nada' : `FALTA ${missing} cosa(s)`} ==`);
process.exit(missing === 0 ? 0 : 1);
