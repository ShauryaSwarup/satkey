/**
 * server.ts — Sat Key Prover Service
 *
 * POST /prove
 *   Body: { pubkey, address, message, signature, nonce, expiry }
 *   Returns: { proof: string, publicSignals: string[], accountAddress: string, salt: string }
 */

import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import "dotenv/config";
import { hash as starkHash, num } from "starknet";
import { buildPoseidon } from "circomlibjs";
import bitcoinMessage from "bitcoinjs-message";

import { buildProverToml, ProveRequest, decompressPubkey } from "./witness";
import { generateProof } from "./proof";

// Helper: Encode r and s into Bitcoin "Compact" format
// Compact format: [1-byte header] [32-byte r] [32-byte s]
function compactEncode(r: Buffer, s: Buffer): Buffer {
  const r32 = Buffer.alloc(32);
  const s32 = Buffer.alloc(32);
  
  // Ensure we take exactly 32 bytes (right-aligned)
  r.copy(r32, Math.max(0, 32 - r.length), Math.max(0, r.length - 32));
  s.copy(s32, Math.max(0, 32 - s.length), Math.max(0, s.length - 32));
  
  // Header 31 is standard for compressed pubkeys. bitcoinjs-message tries 31-34.
  const header = 31; 
  return Buffer.concat([Buffer.from([header]), r32, s32]);
}

// Helper: Parse ASN.1 DER signature into r and s
function derDecode(der: Buffer): { r: Buffer; s: Buffer } {
  if (der[0] !== 0x30) throw new Error("Not a DER signature");
  let off = 2;
  
  if (der[off++] !== 0x02) throw new Error("Expected r-integer");
  const rLen = der[off++];
  const r = der.slice(off, off + rLen);
  off += rLen;
  
  if (der[off++] !== 0x02) throw new Error("Expected s-integer");
  const sLen = der[off++];
  const s = der.slice(off, off + sLen);
  
  return { r, s };
}

// Helper: DER-encode r and s buffers into ASN.1 DER signature (legacy fallback)
function derEncode(r: Buffer, s: Buffer): Buffer {
  const strip = (buf: Buffer) => {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0) i++;
    return buf.slice(i);
  };

  let rS = strip(r);
  let sS = strip(s);

  if ((rS[0] & 0x80) !== 0) rS = Buffer.concat([Buffer.from([0x00]), rS]);
  if ((sS[0] & 0x80) !== 0) sS = Buffer.concat([Buffer.from([0x00]), sS]);

  const totalLen = 2 + rS.length + 2 + sS.length;
  const out = Buffer.alloc(2 + totalLen);
  let off = 0;
  out[off++] = 0x30;
  out[off++] = totalLen;
  out[off++] = 0x02;
  out[off++] = rS.length;
  rS.copy(out, off);
  off += rS.length;
  out[off++] = 0x02;
  out[off++] = sS.length;
  sS.copy(out, off);
  return out;
}

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

function resolveCircuitDir(): string {
  if (process.env.CIRCUIT_ARTIFACT_PATH) {
    let dir = path.resolve(path.dirname(process.env.CIRCUIT_ARTIFACT_PATH));
    for (let i = 0; i < 3; i++) {
      if (fs.existsSync(path.join(dir, "Nargo.toml"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return path.resolve(path.dirname(process.env.CIRCUIT_ARTIFACT_PATH));
  }
  return path.resolve(path.join(__dirname, "../../../circuits/satkey_auth"));
}

const CIRCUIT_DIR = resolveCircuitDir();
const poseidonPromise = buildPoseidon();
const STARK_FIELD_PRIME = BigInt("0x0800000000000011000000000000000000000000000000000000000000000001");
const DOMAIN_TAG = BigInt("0x5341544b4559"); // "SATKEY" ASCII

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "satkey-prover" });
});

async function computeSalt(pubkey: string) {
  const { x, y } = decompressPubkey(pubkey);
  const px = BigInt("0x" + x);
  const py = BigInt("0x" + y);

  const poseidon = await poseidonPromise;
  const Fr = poseidon.F;

  const MASK128 = (1n << 128n) - 1n;
  const x_hi = px >> 128n;
  const x_lo = px & MASK128;
  const y_hi = py >> 128n;
  const y_lo = py & MASK128;

  const saltHash = poseidon([Fr.e(x_hi), Fr.e(x_lo), Fr.e(y_hi), Fr.e(y_lo), Fr.e(DOMAIN_TAG)]);
  const bn254Salt = poseidon.F.toObject(saltHash) as bigint;
  const salt = bn254Salt % STARK_FIELD_PRIME;

  return salt;
}

app.post("/prove", async (req, res) => {
  try {
    const { pubkey, address, message, signature, nonce, expiry } = req.body;

    if (!pubkey || !address || !message || !signature || !nonce || !expiry) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const expectedMessage = `login:${nonce}:${expiry}`;
    if (message !== expectedMessage) {
      return res.status(400).json({ error: "Message does not match expected login format" });
    }

    // DEV-LOG
    try {
      const sigPreview = typeof signature === 'string' ? signature.slice(0, 128) : 'object';
      console.log('[dev] /prove payload => message:', message);
      console.log('[dev] /prove payload => address:', address, 'pubkey:', pubkey);
      console.log('[dev] /prove payload => signature preview:', sigPreview);
    } catch (e) {}

    let isValid = false;
    try {
      isValid = bitcoinMessage.verify(message, address, signature);
    } catch (primaryErr) {
      console.warn("Primary signature verify failed. Attempting normalization...");
      
      try {
        let sigToTry: string | undefined;

        if (typeof signature === 'string') {
          const s = (signature as string).trim();
          let buf: Buffer | undefined;
          
          if (s.startsWith('0x')) {
            buf = Buffer.from(s.slice(2), 'hex');
          } else if (/^[0-9a-fA-F]+$/.test(s)) {
            buf = Buffer.from(s, 'hex');
          } else if (/^[A-Za-z0-9+/=]+$/.test(s)) {
            buf = Buffer.from(s, 'base64');
          }

          if (buf) {
            if (buf[0] === 0x30) {
              try {
                const { r, s } = derDecode(buf);
                sigToTry = compactEncode(r, s).toString('base64');
              } catch (e) {
                sigToTry = buf.toString('base64');
              }
            } else {
              sigToTry = buf.toString('base64');
            }
          } else {
            // Try parsing JSON { r, s }
            try {
              const obj = JSON.parse(s);
              if (obj && obj.r && obj.s) {
                const r = Buffer.from(String(obj.r).replace(/^0x/, ''), 'hex');
                const ss = Buffer.from(String(obj.s).replace(/^0x/, ''), 'hex');
                sigToTry = compactEncode(r, ss).toString('base64');
              }
            } catch (e) {}
          }
        } else if (signature && typeof signature === 'object') {
          const sigObj: any = signature;
          if (sigObj.r && sigObj.s) {
            const r = Buffer.from(String(sigObj.r).replace(/^0x/, ''), 'hex');
            const s = Buffer.from(String(sigObj.s).replace(/^0x/, ''), 'hex');
            sigToTry = compactEncode(r, s).toString('base64');
          } else if (Array.isArray(sigObj) || Buffer.isBuffer(sigObj) || sigObj instanceof Uint8Array) {
            const buf = Buffer.from(sigObj as any);
            if (buf[0] === 0x30) {
              try {
                const { r, s } = derDecode(buf);
                sigToTry = compactEncode(r, s).toString('base64');
              } catch (e) {
                sigToTry = buf.toString('base64');
              }
            } else {
              sigToTry = buf.toString('base64');
            }
          }
        }

        if (sigToTry) {
          try {
            isValid = bitcoinMessage.verify(message, address, sigToTry);
            if (isValid) console.log('Normalization succeeded');
          } catch (e) {}
          
          // Final desperate fallback: try header 32 if 31 failed
          if (!isValid && sigToTry) {
            try {
               const buf = Buffer.from(sigToTry, 'base64');
               if (buf.length === 65 && buf[0] === 31) {
                 buf[0] = 32;
                 isValid = bitcoinMessage.verify(message, address, buf.toString('base64'));
                 if (isValid) console.log('Normalization succeeded with header 32');
               }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('Normalization process failed:', e);
      }
    }

    if (!isValid) {
      return res.status(401).json({ error: "Invalid Bitcoin signature" });
    }

    const proveReq: ProveRequest = { pubkey, nonce, expiry };
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "satkey-prove-"));

    try {
      const tomlContent = buildProverToml(proveReq);
      fs.writeFileSync(path.join(workDir, "Prover.toml"), tomlContent, "utf8");
      const result = await generateProof(workDir, CIRCUIT_DIR);
      const salt = await computeSalt(pubkey);
      const classHash = process.env.SATKEY_CLASS_HASH || "0x0";
      const verifierClassHash = process.env.VERIFIER_CLASS_HASH || "0x0";
      const constructorCalldata = [verifierClassHash, num.toHex(salt)];

      const accountAddress = starkHash.calculateContractAddressFromHash(
        num.toHex(salt),
        classHash,
        constructorCalldata,
        0,
      );

      res.json({
        ...result,
        accountAddress: num.toHex(accountAddress),
        salt: "0x" + salt.toString(16),
      });
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  } catch (err: any) {
    console.error("[prover] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[prover] Listening on http://localhost:${PORT}`);
});

export default app;
