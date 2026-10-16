import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
JSON.parse(readFileSync('public/data/latest.json', 'utf8'));
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
const assets = {};
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml' };
function collect(dir, prefix = '') {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const key = `${prefix}/${item.name}`;
    if (item.isDirectory()) collect(`${dir}/${item.name}`, key);
    else assets[key] = { body: readFileSync(`${dir}/${item.name}`, 'utf8'), type: types[item.name.split('.').pop()] || 'text/plain' };
  }
}
collect('public');
mkdirSync('dist/server', { recursive: true });
mkdirSync('dist/.openai', { recursive: true });
writeFileSync('dist/server/index.js', `const ASSETS = ${JSON.stringify(assets)};\n${readFileSync('worker/index.js', 'utf8')}`);
cpSync('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Built static dashboard and standalone Sites worker → dist/');
