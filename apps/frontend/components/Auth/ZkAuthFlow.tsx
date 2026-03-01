"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { useAuth } from "@/providers/AuthProvider";
import { formatStarknetAddress } from "@/lib/starknet";
import { request, RpcErrorCode } from "sats-connect";
import { Check, Loader2, AlertCircle, Key, ShieldCheck, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

// Environment variables (configure these for your deployment)
const PROVER_URL = process.env.NEXT_PUBLIC_PROVER_URL || "http://localhost:3001";
const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || "http://localhost:3002";

type Step = "idle" | "signing" | "proving" | "deploying" | "success" | "error";

export function ZkAuthFlow({ className, onComplete }: { className?: string; onComplete?: () => void }) {
  const { isConnected, addresses, setIsAuthenticated, setZkProof, setStarknetAddress, starknetAddress } = useAuth();
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  /**
   * secp256k1 curve order and half-order for low-s normalization.
   * Noir's ecdsa_secp256k1::verify_signature requires s <= order/2 (BIP-62).
   */
  const SECP256K1_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const SECP256K1_HALF_ORDER = SECP256K1_ORDER / 2n;

  /**
   * Normalizes a Bitcoin signature from wallet to r, s components.
   * Also enforces low-s normalization required by Noir's ECDSA verifier.
   */
  function parseSignatureToRS(signature: string): { r: string; s: string } {
    // sats-connect returns base64-encoded signature
    // ECDSA: 64-byte compact (r || s) or 65-byte (recovery || r || s) or DER
    let bytes: Uint8Array;
    try {
      const binaryString = atob(signature);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    } catch {
      // Already hex or raw — try hex decode
      const hex = signature.startsWith("0x") ? signature.slice(2) : signature;
      bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    }

    let rBytes: Uint8Array;
    let sBytes: Uint8Array;

    if (bytes.length === 65) {
      // 65-byte: recovery_id (1) || r (32) || s (32)
      rBytes = bytes.slice(1, 33);
      sBytes = bytes.slice(33, 65);
    } else if (bytes.length === 64) {
      // 64-byte compact: r (32) || s (32)
      rBytes = bytes.slice(0, 32);
      sBytes = bytes.slice(32, 64);
    } else if (bytes[0] === 0x30) {
      // DER-encoded: 0x30 len 0x02 rLen r 0x02 sLen s
      let offset = 2; // skip 0x30 and total length
      if (bytes[offset] !== 0x02) throw new Error("Invalid DER: expected 0x02 for r");
      offset++;
      const rLen = bytes[offset++];
      const rRaw = bytes.slice(offset, offset + rLen);
      offset += rLen;
      if (bytes[offset] !== 0x02) throw new Error("Invalid DER: expected 0x02 for s");
      offset++;
      const sLen = bytes[offset++];
      const sRaw = bytes.slice(offset, offset + sLen);
      // Strip leading 0x00 padding byte (DER adds it for sign bit)
      rBytes = rRaw[0] === 0 ? rRaw.slice(1) : rRaw;
      sBytes = sRaw[0] === 0 ? sRaw.slice(1) : sRaw;
    } else if (bytes.length === 66 && bytes[0] === 0x01) {
      // Sometimes wallets prefix a 65-byte sig with length or dummy byte 0x01
      rBytes = bytes.slice(2, 34);
      sBytes = bytes.slice(34, 66);
    } else {
      throw new Error(`Unsupported signature format (length=${bytes.length}, first=0x${bytes[0].toString(16)})`);
    }

    const toHex = (b: Uint8Array) =>
      "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");

    // Low-s normalization: Noir's ecdsa_secp256k1::verify_signature requires s <= order/2.
    // Bitcoin wallets (via bitcoinjs-message) may return high-s signatures.
    let sVal = BigInt(toHex(sBytes));
    if (sVal > SECP256K1_HALF_ORDER) {
      sVal = SECP256K1_ORDER - sVal;
      const sHex = sVal.toString(16).padStart(64, "0");
      sBytes = new Uint8Array(sHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    }

    return { r: toHex(rBytes), s: toHex(sBytes) };
  }

  /**
   * Encode an integer as a Bitcoin-style varint (CompactSize).
   * See https://en.bitcoin.it/wiki/Protocol_documentation#Variable_length_integer
   */
  function encodeVarint(n: number): Uint8Array {
    if (n < 0xfd) return new Uint8Array([n]);
    if (n <= 0xffff) {
      const buf = new Uint8Array(3);
      buf[0] = 0xfd;
      buf[1] = n & 0xff;
      buf[2] = (n >> 8) & 0xff;
      return buf;
    }
    if (n <= 0xffffffff) {
      const buf = new Uint8Array(5);
      buf[0] = 0xfe;
      buf[1] = n & 0xff;
      buf[2] = (n >> 8) & 0xff;
      buf[3] = (n >> 16) & 0xff;
      buf[4] = (n >> 24) & 0xff;
      return buf;
    }
    throw new Error("Message too long for varint encoding");
  }

  /**
   * Compute the message hash the way Bitcoin wallets do when signing a message.
   *
   * Bitcoin Signed Message format:
   *   double_SHA256("\x18Bitcoin Signed Message:\n" + varint(message.length) + message)
   *
   * sats-connect's signMessage uses this format internally, so we must match it
   * when computing the hash we send to the ZK prover.
   */
  function computeMessageHash(message: string): string {
    const prefix = "\x18Bitcoin Signed Message:\n";
    const prefixBytes = new TextEncoder().encode(prefix);
    const messageBytes = new TextEncoder().encode(message);
    const messageLenVarint = encodeVarint(messageBytes.length);

    const fullMessage = concatBytes(prefixBytes, messageLenVarint, messageBytes);

    // Double SHA-256
    const hash = sha256(sha256(fullMessage));

    const hashHex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return "0x" + hashHex;
  }


  const handleAuthenticate = async () => {
    if (!isConnected || addresses.length === 0) {
      setErrorMsg("Wallet not connected");
      setStep("error");
      return;
    }

    try {
      setStep("signing");

      // Get the payment address specifically, because Ordinals (Taproot) addresses use 
      // Schnorr signatures, but our ZK circuit currently verifies ECDSA secp256k1!
      const paymentAddressObj = addresses.find((a: any) => a.purpose === 'payment');
      if (!paymentAddressObj) {
        setErrorMsg("No payment address found - cannot sign with ECDSA");
        setStep("error");
        return;
      }
      const addressToSign = paymentAddressObj.address;
      
      // Auth message - includes nonce and expiry for replay protection
      const nonce = Date.now().toString();
      const expiry = (Date.now() + 5 * 60 * 1000).toString(); // 5 minutes
      const message = `Authenticate with Sat Key\n\nNonce: ${nonce}\nExpiry: ${expiry}\n\nSign this message to prove ownership of your wallet and generate a Zero-Knowledge Proof for Starknet.`;

      // Step 1: Sign message with Bitcoin wallet
      const signResponse = await request("signMessage", {
        address: addressToSign,
        message,
      });

      if (signResponse.status !== "success") {
        throw new Error(signResponse.error?.message || "Failed to sign message");
      }

      const signature = signResponse.result.signature;
      
      // Parse signature into r, s components
      const { r, s } = parseSignatureToRS(signature);

      // Step 2: Compute message hash
      const messageHash = computeMessageHash(message);

      // Step 3: Get public key hex - CRITICAL: Must use the SAME payment address's pubkey
      // that we're signing with, NOT btcPubkeyHex (which may be stale or wrong key)
      if (!paymentAddressObj?.publicKey) {
        setErrorMsg("Payment address missing public key - cannot generate ZK proof");
        setStep("error");
        return;
      }
      const pubkeyHex = paymentAddressObj.publicKey;

      // Step 4: Call prover service to generate ZK proof
      setStep("proving");

      const proveResponse = await fetch(`${PROVER_URL}/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: pubkeyHex,
          signature_r: r,
          signature_s: s,
          message_hash: messageHash,
          nonce,
          expiry,
        }),
      });

      if (!proveResponse.ok) {
        const error = await proveResponse.text();
        throw new Error(`Prover error: ${error}`);
      }

      const proofData = await proveResponse.json();
      setZkProof(proofData);
      setStep("deploying");

      const deployResponse = await fetch(`${RELAYER_URL}/deploy-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: proofData.proof,
          publicSignals: proofData.publicSignals,
          pubkey: pubkeyHex,
        }),
      });

      if (!deployResponse.ok) {
        const error = await deployResponse.text();
        throw new Error(`Relayer error: ${error}`);
      }

      const deployResult = await deployResponse.json();
      setStarknetAddress(deployResult.accountAddress);
      setIsAuthenticated(true);
      setStep("success");
      onComplete?.();

    } catch (error: unknown) {
      console.error("Authentication error:", error);
      
      if (error && typeof error === "object" && "code" in error && error.code === RpcErrorCode.USER_REJECTION) {
        setErrorMsg("Request canceled by user");
      } else if (error instanceof Error) {
        setErrorMsg(error.message);
      } else {
        setErrorMsg("An error occurred during authentication");
      }
      setStep("error");
    }
  };

  const resetFlow = () => {
    setStep("idle");
    setErrorMsg("");
  };

  if (!isConnected) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-xl shadow-2xl", className)}>
        <ShieldCheck className="w-16 h-16 text-white/20 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Authentication Required</h3>
        <p className="text-sm text-white/60 text-center">Please connect your wallet to authenticate.</p>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden flex flex-col items-center justify-center p-8 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-xl shadow-2xl", className)}>
      {/* Decorative background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-[200px] max-h-[200px] bg-orange-500/20 blur-[80px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-sm min-h-[240px] flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {step === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center text-center w-full"
            >
              <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-6">
                <Key className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">ZK Authentication</h3>
              <p className="text-sm text-white/60 mb-8">
                Sign a message to generate a Zero-Knowledge proof of your Bitcoin ownership.
              </p>
              <button
                onClick={handleAuthenticate}
                className="w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]"
              >
                Sign to Authenticate
              </button>
            </motion.div>
          )}

          {step === "signing" && (
            <motion.div
              key="signing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center text-center w-full"
            >
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-orange-500/20" />
                <motion.div 
                  className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Key className="w-8 h-8 text-orange-400 animate-pulse" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Awaiting Signature</h3>
              <p className="text-sm text-white/60">
                Please confirm the signature request in your wallet.
              </p>
            </motion.div>
          )}

          {step === "proving" && (
            <motion.div
              key="proving"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center text-center w-full"
            >
              <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                <motion.div 
                  className="absolute inset-0 rounded-xl border border-orange-500/30"
                  animate={{ rotate: [0, 90, 180, 270, 360] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
                <motion.div 
                  className="absolute inset-2 rounded-xl border border-orange-400/40"
                  animate={{ rotate: [360, 270, 180, 90, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                />
                <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Generating ZK Proof</h3>
              <p className="text-sm text-white/60">
                Computing zero-knowledge proof of signature...
              </p>
            </motion.div>
          )}

          {step === "deploying" && (
            <motion.div
              key="deploying"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center text-center w-full"
            >
              <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-xl border border-orange-500/30"
                  animate={{ rotate: [0, 90, 180, 270, 360] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-2 rounded-xl border border-orange-400/40"
                  animate={{ rotate: [360, 270, 180, 90, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                />
                <Rocket className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Deploying Account</h3>
              <p className="text-sm text-white/60">Creating your Starknet account...</p>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center w-full"
            >
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12, stiffness: 200 }}
                className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-6"
              >
                <Check className="w-10 h-10 text-green-400" />
              </motion.div>
              <h3 className="text-xl font-semibold text-white mb-2">Authenticated!</h3>
              <div className="text-sm text-white/60 space-y-1">
                <p>Your identity has been verified successfully.</p>
                {starknetAddress && <p>Your Starknet address: {formatStarknetAddress(starknetAddress)}</p>}
              </div>
            </motion.div>
          )}

          {step === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center text-center w-full"
            >
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Authentication Failed</h3>
              <p className="text-sm text-red-400/80 mb-8">
                {errorMsg}
              </p>
              <button
                onClick={resetFlow}
                className="w-full py-3 px-4 bg-white/10 hover:bg-white/15 text-white rounded-xl font-medium transition-colors border border-white/10"
              >
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ZkAuthFlow;
