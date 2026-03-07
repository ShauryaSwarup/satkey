const bitcoinMessage = require('bitcoinjs-message');

function derDecode(der) {
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

function tryCompactVerify(message, address, r, s) {
  const r32 = Buffer.alloc(32);
  const s32 = Buffer.alloc(32);
  r.copy(r32, Math.max(0, 32 - r.length), Math.max(0, r.length - 32));
  s.copy(s32, Math.max(0, 32 - s.length), Math.max(0, s.length - 32));

  for (let header = 27; header <= 42; header++) {
    const compact = Buffer.concat([Buffer.from([header]), r32, s32]);
    try {
      if (bitcoinMessage.verify(message, address, compact.toString('base64'))) {
        console.log("Succeeded with header:", header);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

const message = "login:0:1772907510";
const address = "mnYvHzpmEUr2CdKg9PSWbXQ9vTE9AHfeLz";
const derBase64 = "MEQCIF9uaVvsX1oKl5HqXJBcMK4w1hYudGrTzpoaqHiAf+2nAiAMPQ246ZeL4MvHJDUbXXoljePiYVbAMW7s+1v9R449cA==";

console.log("Input Message:", message);
console.log("Input Address:", address);
console.log("Input DER Base64:", derBase64);

try {
  const derBuf = Buffer.from(derBase64, 'base64');
  console.log("DER Buffer Length:", derBuf.length);
  
  const { r, s } = derDecode(derBuf);
  console.log("Extracted r length:", r.length);
  console.log("Extracted s length:", s.length);
  
  const isValid = tryCompactVerify(message, address, r, s);
  console.log("Verification Success (brute force headers):", isValid);
} catch (e) {
  console.error("Test failed:", e);
}
