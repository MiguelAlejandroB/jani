import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'app', 'package.json'));
const { zipSync } = require('fflate');

const packsDir = join(root, 'packs');
const outDir = join(root, 'app', 'public', 'packs');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const catalog = [];
const dirs = readdirSync(packsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const dir of dirs) {
  const jsonPath = join(packsDir, dir, 'pack.json');
  if (!existsSync(jsonPath)) continue;
  const raw = readFileSync(jsonPath);
  const pack = JSON.parse(raw.toString('utf8'));
  const files = { 'pack.json': new Uint8Array(raw) };
  let audios = 0;
  const audioDir = join(packsDir, dir, 'audio');
  if (existsSync(audioDir)) {
    for (const f of readdirSync(audioDir).filter((n) => n.endsWith('.mp3')).sort()) {
      files[`audio/${f}`] = new Uint8Array(readFileSync(join(audioDir, f)));
      audios++;
    }
  }
  const zip = zipSync(files);
  writeFileSync(join(outDir, `${pack.id}.zip`), zip);
  catalog.push({
    id: pack.id,
    version: pack.version,
    language: { code: pack.language.code, name: pack.language.name },
    file: `${pack.id}.zip`,
    size: zip.length,
  });
  console.log(`${pack.id}: ${zip.length} bytes, ${audios} / ${Object.keys(pack.phrases).length} audios`);
}

catalog.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
