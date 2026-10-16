#!/usr/bin/env node
// Idempotently provisions the D1 database bound as env.DB.
//
//  - If wrangler.toml already has a real database_id, does nothing.
//  - Otherwise looks the database up by name (database_name from
//    wrangler.toml, or D1_DATABASE_NAME, default "nexus-db").
//  - Creates it only if it does not exist yet.
//  - Patches database_name / database_id in the *working copy* of
//    wrangler.toml so the following `wrangler deploy` binds to it.
//    The change is not committed.
//
// Requires CLOUDFLARE_API_TOKEN (with D1 edit permission) and
// CLOUDFLARE_ACCOUNT_ID in the environment. The schema itself is created at
// runtime by DbService.ensureSchema(), so no migrations run here.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOML = path.resolve(fileURLToPath(new URL('../wrangler.toml', import.meta.url)));
const PLACEHOLDER_NAME = 'REPLACE_WITH_D1_NAME';
const PLACEHOLDER_ID = 'REPLACE_WITH_D1_ID';
const DEFAULT_NAME = process.env.D1_DATABASE_NAME || 'nexus-db';

function fail(msg) {
  console.error(`ensure-d1: ${msg}`);
  process.exit(1);
}

function wrangler(args) {
  return spawnSync('npx', ['--yes', 'wrangler@4', ...args], { encoding: 'utf8', env: process.env });
}

function findDb(name) {
  const r = wrangler(['d1', 'list', '--json']);
  if (r.status !== 0) fail(`"wrangler d1 list" failed:\n${r.stderr || r.stdout}`);
  const start = r.stdout.indexOf('[');
  if (start < 0) fail(`unexpected "wrangler d1 list" output:\n${r.stdout}`);
  let list;
  try {
    list = JSON.parse(r.stdout.slice(start));
  } catch {
    fail(`could not parse "wrangler d1 list" output:\n${r.stdout}`);
  }
  return list.find((d) => d.name === name) || null;
}

const toml = fs.readFileSync(TOML, 'utf8');
const nameMatch = toml.match(/database_name\s*=\s*"([^"]*)"/);
const idMatch = toml.match(/database_id\s*=\s*"([^"]*)"/);
if (!nameMatch || !idMatch) fail('database_name / database_id not found in wrangler.toml');

if (idMatch[1] && idMatch[1] !== PLACEHOLDER_ID) {
  console.log(`ensure-d1: database_id already set (${idMatch[1]}), nothing to do.`);
  process.exit(0);
}

const name = nameMatch[1] && nameMatch[1] !== PLACEHOLDER_NAME ? nameMatch[1] : DEFAULT_NAME;

let db = findDb(name);
if (db) {
  console.log(`ensure-d1: database "${name}" already exists (${db.uuid}), reusing it.`);
} else {
  console.log(`ensure-d1: database "${name}" not found, creating it...`);
  const r = wrangler(['d1', 'create', name]);
  if (r.status !== 0) console.warn(`ensure-d1: create returned an error (may be a concurrent create):\n${r.stderr || r.stdout}`);
  db = findDb(name);
  if (!db) fail(`database "${name}" still not found after create`);
  console.log(`ensure-d1: database "${name}" ready (${db.uuid}).`);
}

const patched = toml
  .replace(/database_name\s*=\s*"[^"]*"/, () => `database_name = "${name}"`)
  .replace(/database_id\s*=\s*"[^"]*"/, () => `database_id = "${db.uuid}"`);
fs.writeFileSync(TOML, patched);
console.log('ensure-d1: wrangler.toml updated in the working copy.');
