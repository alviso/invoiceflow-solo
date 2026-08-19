#!/usr/bin/env node
/* Publish a file INTO the blindrange network as content-addressed
 * chunks, readable by loader.html#<hash>. The application is stored in
 * the same database it runs on.
 *
 *   node publish.mjs <file> [gateway]
 *
 * Chunks are keyed "B:" + sha256(chunk); a manifest entry under
 * "B:" + sha256(whole) lists them. Immutable by construction: a new
 * version is a new hash.
 *
 * Placement is ring-aware, exactly like the real client: each key goes
 * to ITS replicas, not to whichever node answered first. Honesty note:
 * on the public demo network the issuer-gated seed refuses unpaid
 * writes and the ungated volunteer nodes accept them — public blobs
 * currently ride the same free-rider path every demo write does. "Who
 * pays for public content" is an open metering design item, stated
 * rather than hidden.
 */
import { readFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import { Ring, failureGroup } from "./blindrange.js";

const [, , file, gateway = "https://blindrange.dev/api"] = process.argv;
if (!file) { console.error("usage: node publish.mjs <file> [gateway]"); process.exit(1); }
const SECRET = "blindrange-public";
const SEED = "seed.blindrange.dev:7501";
const CHUNK = 24 * 1024;

const data = new Uint8Array(readFileSync(file));
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (b) => hex(await crypto.subtle.digest("SHA-256", b));
const b64 = (u) => Buffer.from(u).toString("base64");
const sign = async (body) => {
  const k = await crypto.subtle.importKey("raw", Buffer.from(SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, body));
};
async function fwd(addr, method, path, payload) {
  const inner = payload === null ? "" : JSON.stringify(payload);
  const env = Buffer.from(JSON.stringify({ addr, method, path,
    body_b64: inner ? b64(Buffer.from(inner)) : "" }));
  const r = await fetch(gateway + "/fwd", { method: "POST",
    headers: { "Content-Type": "application/json",
               "X-BR-Auth": await sign(env) }, body: env });
  const out = await r.json();
  if (out.status >= 400)
    throw new Error(`${addr}${path} -> ${out.status}: ` +
      Buffer.from(out.body_b64 || "", "base64"));
  return JSON.parse(Buffer.from(out.body_b64, "base64"));
}

// membership + ring, same derivation as every client
const peers = (await fwd(SEED, "GET", "/peers", null)).peers;
const addrOf = {}, groups = {};
for (const [nid, e] of Object.entries(peers))
  if ((e.age ?? 1e9) <= 40 && e.addr && !e.addr.startsWith("via:")) {
    // direct nodes only: blob readers are simple by design
    addrOf[nid] = e.addr;
    groups[nid] = failureGroup(e.addr, e.udp || "");
  }
const ring = await Ring.build(Object.keys(addrOf).sort(), { groups });
console.error(`ring: ${ring.addrs.length} direct node(s)`);

const chunks = [];
for (let i = 0; i < data.length; i += CHUNK)
  chunks.push(data.slice(i, i + CHUNK));
const ids = [];
for (const c of chunks) ids.push(await sha(c));
const whole = await sha(data);
console.error(`${file}: ${data.length} bytes -> ${chunks.length} chunk(s)`);

const entries = chunks.map((c, i) => ["B:" + ids[i], b64(c)]);
entries.push(["B:" + whole, b64(Buffer.from(JSON.stringify({ chunks: ids })))]);
for (const [k, v] of entries) {
  let acks = 0;
  for (const nid of await ring.route(k, Math.min(6, ring.addrs.length))) {
    try {
      await fwd(addrOf[nid], "POST", "/kv", { entries: [[k, v]] });
      acks += 1;
      if (acks >= 2) break;       // quorum; repair spreads the rest
    } catch { continue; }         // gated or down: try the next replica
  }
  if (acks === 0) throw new Error(`no node accepted ${k.slice(0, 14)}…`);
  console.error(`  ${k.slice(0, 14)}… stored on ${acks} node(s)`);
}
// verify end-to-end the way the loader will read it
async function blobGet(key) {
  for (const nid of await ring.route(key, Math.min(6, ring.addrs.length))) {
    try {
      const r = await fwd(addrOf[nid], "POST", "/mget",
        { keys: [key], nonce: hex(crypto.getRandomValues(new Uint8Array(16))) });
      if (r.values && r.values[key]) return r.values[key];
    } catch { continue; }
  }
  return null;
}
if (!(await blobGet("B:" + whole))) throw new Error("readback failed");
console.log(whole);
console.error(`\nloader.html#${whole}`);
