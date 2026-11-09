// Package the real app renderer with a browser-only API into one offline HTML.
import { build } from 'vite';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp(join(tmpdir(), 'agenthub-renderer-demo-'));
try {
  await build({ configFile: false, root, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [react()], logLevel: 'warn', build: { outDir: output, emptyOutDir: true, cssCodeSplit: false, minify: true, lib: { entry: join(root, 'submission/demo-source/entry.ts'), name: 'AgentHubDemo', formats: ['iife'], fileName: () => 'demo.js' } } });
  const names = await readdir(output);
  const js = await readFile(join(output, 'demo.js'), 'utf8');
  const css = (await Promise.all(names.filter(name => name.endsWith('.css')).map(name => readFile(join(output, name), 'utf8')))).join('\n');
  const app = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>AgentHub</title><style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  const appJSON = JSON.stringify(app).replaceAll('<', '\\u003c');
  const originalCSS = await readFile(join(root, 'apps/desktop/src/renderer/src/style.css'));
  const stamp = `Renderer CSS SHA-256: ${createHash('sha256').update(originalCSS).digest('hex')}`;
  const wrapper = await readFile(join(root, 'submission/demo-source/wrapper.html'), 'utf8');
  const html = wrapper.replace('{{APP_HTML_JSON}}', () => appJSON).replace('{{SOURCE_HASH}}', stamp);
  const destination = join(root, 'submission/agenthub-demo.html');
  await writeFile(destination, html);
  if (Buffer.byteLength(html) >= 10_000_000) throw Error('Submission exceeds 10 MB');
  console.log(`Built ${destination}: ${Buffer.byteLength(html).toLocaleString('en-US')} bytes.\n${stamp}`);
} finally { await rm(output, { recursive: true, force: true }); }
