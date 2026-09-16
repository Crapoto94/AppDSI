// Copie les ressources runtime de pdf.js (wasm de décodage des images raster
// JBIG2/JPEG2000, profils ICC, cmaps, polices standard) depuis
// node_modules/pdfjs-dist vers public/pdfjs, afin qu'elles soient servies par
// Vite en dev et embarquées dans le build de production.
//
// Sans ces fichiers, les PDF scannés/raster (CCITT, JBIG2, JPEG2000) s'affichent
// en pages blanches car pdf.js ne peut pas décoder les images.
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'node_modules', 'pdfjs-dist');
const dest = resolve(root, 'public', 'pdfjs');

const DIRS = ['wasm', 'iccs', 'cmaps', 'standard_fonts'];

if (!existsSync(src)) {
  console.warn('[pdfjs-assets] node_modules/pdfjs-dist introuvable — copie ignorée');
  process.exit(0);
}

await mkdir(dest, { recursive: true });
for (const d of DIRS) {
  const from = resolve(src, d);
  if (!existsSync(from)) continue;
  const to = resolve(dest, d);
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
}
console.log(`[pdfjs-assets] ${DIRS.join(', ')} copiés dans public/pdfjs`);
