// Lanza Playwright con los navegadores instalados dentro del repo (node_modules/playwright-core/.local-browsers).
// Wrapper en node para que `npm run e2e` funcione igual en cmd.exe y en shells POSIX.
//   node scripts/e2e.mjs [args de playwright test]   -> pruebas
//   node scripts/e2e.mjs install                      -> instala Chromium dentro del repo
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0' };
const args = process.argv.slice(2);
const cmd = args[0] === 'install' ? ['install', 'chromium'] : ['test', ...args];
const r = spawnSync(process.execPath, [cli, ...cmd], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
