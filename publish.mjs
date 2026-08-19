#!/usr/bin/env node
/* Publish a file INTO the blindrange network as content-addressed
 * chunks, readable by loader.html#<hash>. The application is stored in
 * the same database it runs on.
 *
 *   node publish.mjs <file> [gateway]
 *
 * Chunks are keyed "B:" + sha256(chunk); a manifest entry under
 * "B:" + sha256(whole) lists them. Immutable by construction: a new
 * version is a new hash. Honesty note: on the public demo network this
 * is unowned, unmetered data — fine for demos; "who pays for public
 * blobs" is an open design item, stated rather than hidden.
 */
import { readFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const [, , file, gateway = "https://blindrange.dev/api"] = process.argv;
if (!file) { console.error("usage: node publish.mjs <file> [gateway]"); process.exit(1); }
const SECRET = "blindrange-public";
const SEED = "seed.blindrange.dev:7501";
const CHUNK = 24 * 1024;                 // fits comfortably in one entry

const data = new Uint8Array(readFileSync(file));
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (b) => hex(await crypto.subtle.digest("SHA-256", b));
const b64 = (u) => Buffer.from(u).toString("base64");
const sign = async (body) => {
  const k = await crypto.subtle.importKey("raw", Buffer.from(SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, body));
};
async function post(path, payload) {
  const inner = JSON.stringify(payload);
  const env = Buffer.from(JSON.stringify({ addr: SEED, method: "POST",
    path, body_b64: b64(Buffer.from(inner)) }));
  const r = await fetch(gateway + "/fwd", { method: "POST",
    headers: { "Content-Type": "application/json",
               "X-BR-Auth": await sign(env) }, body: env });
  const out = await r.json();
  if (out.status !== 200)
    throw new Error(`${path} -> ${out.status}: ${Buffer.from(out.body_b64 || "", "base64")}`);
  return JSON.parse(Buffer.from(out.body_b64, "base64"));
}

const chunks = [];
for (let i = 0; i < data.length; i += CHUNK)
  chunks.push(data.slice(i, i + CHUNK));
const ids = [];
for (const c of chunks) ids.push(await sha(c));
const whole = await sha(data);

console.error(`${file}: ${data.length} bytes -> ${chunks.length} chunk(s)`);
const entries = chunks.map((c, i) => ["B:" + ids[i], b64(c)]);
entries.push(["B:" + whole, b64(Buffer.from(JSON.stringify({ chunks: ids })))]);
for (let i = 0; i < entries.length; i += 8) {
  await post("/kv", { entries: entries.slice(i, i + 8) });
  console.error(`  stored ${Math.min(i + 8, entries.length)}/${entries.length}`);
}
// verify end-to-end before announcing
const back = await post("/mget", { keys: ["B:" + whole] });
if (!back.values || !back.values["B:" + whole])
  throw new Error("verification readback failed");
console.log(whole);
console.error(`\nloader.html#${whole}`);
