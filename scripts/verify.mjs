#!/usr/bin/env node
// Dependency-free static checks for the Worker source tree.
//
//  1. Every module parses (node --check).
//  2. Every relative import resolves to a file and every imported name is
//     actually exported by that file.
//  3. No module references a top-level name that is declared in another
//     module without importing it (ES modules do not share globals, so this
//     would be a runtime ReferenceError).
//
// Exits non-zero if any check fails.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(fileURLToPath(new URL('../src', import.meta.url)));

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const DECL_RE = /^(?:export\s+)?(?:const|let|var|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)/gm;
const DECL_ANY_RE = /(?:^|[^.\w$])(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
const IMPORT_RE = /import\s*(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;
const EXPORT_BRACES_RE = /export\s*\{([^}]*)\}/g;
const EXPORT_PREFIX_RE = /^export\s+(?:const|let|var|function|async\s+function|class)\s+([A-Za-z_$][\w$]*)/gm;

const BUILTINS = new Set([
  'undefined', 'globalThis', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Error', 'TypeError', 'RangeError', 'RegExp',
  'Function', 'BigInt', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'NaN', 'Infinity',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'structuredClone', 'queueMicrotask',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console', 'crypto', 'performance',
  'fetch', 'Request', 'Response', 'Headers', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Float32Array',
  'Float64Array', 'ArrayBuffer', 'DataView', 'WebSocket', 'WebSocketPair', 'ReadableStream', 'WritableStream',
  'TransformStream', 'ByteLengthQueuingStrategy', 'CountQueuingStrategy', 'atob', 'btoa', 'AbortController',
  'AbortSignal', 'Blob', 'FormData', 'caches', 'navigator', 'DOMException', 'addEventListener',
  'removeEventListener', 'close', 'self',
]);

function collectExports(src) {
  const out = new Set();
  let m;
  EXPORT_PREFIX_RE.lastIndex = 0;
  while ((m = EXPORT_PREFIX_RE.exec(src))) out.add(m[1]);
  EXPORT_BRACES_RE.lastIndex = 0;
  while ((m = EXPORT_BRACES_RE.exec(src))) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      out.add(t.includes(' as ') ? t.split(' as ')[1].trim() : t);
    }
  }
  if (/export\s+default\b/.test(src)) out.add('default');
  return out;
}

function collectDecls(src) {
  const out = new Set();
  let m;
  DECL_RE.lastIndex = 0;
  while ((m = DECL_RE.exec(src))) out.add(m[1]);
  return out;
}

function collectDeclsAnywhere(src) {
  const out = new Set();
  let m;
  DECL_ANY_RE.lastIndex = 0;
  while ((m = DECL_ANY_RE.exec(src))) out.add(m[1]);
  return out;
}

const files = walk(SRC);
const info = new Map();
const allTop = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rec = { src, exports: collectExports(src), decls: collectDecls(src) };
  info.set(f, rec);
  for (const d of rec.decls) allTop.add(d);
}

const errors = [];
const rel = (f) => path.relative(SRC, f);

// 1. syntax
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) errors.push(`[syntax] ${rel(f)}\n${(r.stderr || '').trim()}`);
}

// 2 + 3
for (const [f, rec] of info) {
  const imported = new Set();
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(rec.src))) {
    const spec = m[3];
    const names = [];
    if (m[1]) names.push({ local: m[1], imported: 'default' });
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const t = part.trim();
        if (!t) continue;
        if (t.includes(' as ')) {
          const [a, b] = t.split(' as ').map((s) => s.trim());
          names.push({ local: b, imported: a });
        } else names.push({ local: t, imported: t });
      }
    }
    if (!spec.startsWith('.')) {
      for (const n of names) imported.add(n.local);
      continue; // external (cloudflare:sockets)
    }
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) {
      errors.push(`[import] ${rel(f)} imports "${spec}" which does not exist`);
      continue;
    }
    const tinfo = info.get(target);
    for (const n of names) {
      imported.add(n.local);
      if (tinfo && !tinfo.exports.has(n.imported)) {
        errors.push(`[import] ${rel(f)} imports { ${n.imported} } from ${spec} but ${rel(target)} does not export it`);
      }
    }
  }

  // missing-import scan
  const declAnywhere = collectDeclsAnywhere(rec.src);
  const scan = rec.src
    .replace(IMPORT_RE, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const idRe = /(?<![.\w$])([A-Za-z_$][\w$]*)/g;
  const missing = new Set();
  let id;
  while ((id = idRe.exec(scan))) {
    const name = id[1];
    if (BUILTINS.has(name)) continue;
    if (!allTop.has(name)) continue;
    if (rec.decls.has(name) || imported.has(name) || declAnywhere.has(name)) continue;
    const following = scan.slice(id.index + name.length).match(/^\s*:/);
    if (following) continue;
    missing.add(name);
  }
  if (missing.size) errors.push(`[undefined] ${rel(f)} references without import: ${[...missing].sort().join(', ')}`);
}

if (errors.length) {
  console.error(`verify: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(e + '\n');
  process.exit(1);
}
console.log(`verify: OK — ${files.length} modules, imports resolve, no undefined references`);
