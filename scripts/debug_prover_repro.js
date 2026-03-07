#!/usr/bin/env node
/**
 * Simple repro helper: given a JSON file with keys { message, address, signature }
 * attempts various normalization paths and reports which, if any, make
 * bitcoinjs-message.verify succeed locally.
 *
 * Usage:
 *   node scripts/debug_prover_repro.js payload.json
 * Or:
 *   cat payload.json | node scripts/debug_prover_repro.js
 */
const fs = require('fs');
const path = require('path');
const bitcoinMessage = require('bitcoinjs-message');

function derEncode(rBuf, sBuf) {
  const strip = (buf) => {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0) i++;
    return buf.slice(i);
  };
  let r = strip(rBuf);
  let s = strip(sBuf);
  if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0x00]), r]);
  if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0x00]), s]);
  const totalLen = 2 + r.length + 2 + s.length;
  const out = Buffer.alloc(2 + totalLen);
  let off = 0;
  out[off++] = 0x30;
  out[off++] = totalLen;
  out[off++] = 0x02;
  out[off++] = r.length;
  r.copy(out, off); off += r.length;
  out[off++] = 0x02;
  out[off++] = s.length;
  s.copy(out, off);
  return out;
}

function isHexString(s) {
  return typeof s === 'string' && /^0x[0-9a-fA-F]+$/.test(s) || /^[0-9a-fA-F]+$/.test(s);
}

async function main() {
  let input = null;
  if (process.argv[2]) {
    input = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
  } else {
    input = fs.readFileSync(0, 'utf8'); // stdin
  }
  const payload = JSON.parse(input);
  const { message, address, signature } = payload;
  console.log('Message:', message);
  console.log('Address:', address);

  const attempts = [];

  // 1. as-is
  attempts.push({ label: 'as-is', sig: signature });

  // 2. if hex or 0xhex -> base64
  if (typeof signature === 'string' && isHexString(signature)) {
    const s = signature.startsWith('0x') ? signature.slice(2) : signature;
    const buf = Buffer.from(s, 'hex');
    attempts.push({ label: 'hex->base64', sig: buf.toString('base64') });
    attempts.push({ label: 'hex->buf', sig: buf });
  }

  // 3. if looks like base64 -> try decode buffer
  if (typeof signature === 'string') {
    try {
      const decoded = Buffer.from(signature, 'base64');
      if (decoded.length > 0) attempts.push({ label: 'base64->buf', sig: decoded });
    } catch (e) { /* ignore */ }
  }

  // 4. If JSON string with r and s
  if (typeof signature === 'string') {
    try {
      const obj = JSON.parse(signature);
      if (obj && (obj.r || obj.R) && (obj.s || obj.S)) {
        const rhex = String(obj.r || obj.R).replace(/^0x/, '');
        const shex = String(obj.s || obj.S).replace(/^0x/, '');
        const rbuf = Buffer.from(rhex, 'hex');
        const sbuf = Buffer.from(shex, 'hex');
        const der = derEncode(rbuf, sbuf);
        attempts.push({ label: 'json-rs->der->base64', sig: der.toString('base64') });
        attempts.push({ label: 'json-rs->der->buf', sig: der });
      }
    } catch (e) { /* not json */ }
  }

  // 5. If raw array/Uint8Array-like: try Buffer
  if (Array.isArray(signature)) {
    attempts.push({ label: 'array->buf', sig: Buffer.from(signature) });
  }

  // Deduplicate attempts by stringified sig type+length
  const seen = new Set();
  const filtered = attempts.filter(a => {
    try {
      const key = (typeof a.sig) + '|' + (Buffer.isBuffer(a.sig) ? a.sig.length : String(a.sig).slice(0,64));
      if (seen.has(key)) return false; seen.add(key); return true;
    } catch(e) { return true; }
  });

  for (const att of filtered) {
    try {
      const sig = att.sig;
      let ok = false;
      try {
        ok = bitcoinMessage.verify(message, address, sig);
      } catch (err) {
        // verification threw - treat as false
        ok = false;
      }
      console.log(`Attempt [${att.label}] -> success=${ok} (sigType=${typeof sig}${Buffer.isBuffer(sig) ? ',len='+sig.length : ''})`);
    } catch (e) {
      console.error('Attempt failed:', att.label, e && e.message ? e.message : e);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
