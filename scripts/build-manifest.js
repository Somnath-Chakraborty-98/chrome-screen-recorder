// scripts/build-manifest.js
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
const templatePath = resolve(__dirname, '..', 'src', 'manifest.template.json');
const outPath = resolve(__dirname, '..', 'dist', 'manifest.json');

const templateRaw = fs.readFileSync(templatePath, 'utf-8');
let manifest = templateRaw.replace(/__VERSION__/g, pkg.version || '1.0.0');

// Optionally: ensure the background service worker path exists in dist
// If you used TS for service worker, ensure build compiles it to dist/background/serviceWorker.js

fs.writeFileSync(outPath, manifest, 'utf-8');
console.log('Wrote', outPath);
