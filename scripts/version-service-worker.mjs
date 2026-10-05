import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const html = readFileSync('dist/index.html', 'utf8');
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
const sw = readFileSync('public/sw.js', 'utf8').replace('keepnet-shell-v3', `keepnet-shell-${version}`).replace('/* BUILD_ASSETS */', assets.map(asset => `${JSON.stringify(asset)},`).join('\n  '));
writeFileSync('dist/sw.js', sw);
