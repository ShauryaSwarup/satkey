"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { sepoliaValidators, Amount } from "starkzap";
import { sdk } from "@/lib/starkzap";
import { Account, CallData, RpcProvider, uint256 } from "starknet";
import { SatKeySigner } from "@/models/SatKeySigner";
import { useAuth } from "@/providers/AuthProvider";

const STARKNET_RPC_URL = process.env.NEXT_PUBLIC_STARKNET_RPC_URL!;
const PROVER_URL = process.env.NEXT_PUBLIC_PROVER_URL || "http://localhost:3001";
const avnuApiKey = "cc98d665-ba65-4483-8f1f-4b4d25a750ce";

// Grab the first sepolia validator's STRK pool
async function resolveStrkPool() {
  const [firstValidator] = Object.values(sepoliaValidators);
  const pools = await sdk.getStakerPools(firstValidator.stakerAddress);
  const strkPool = pools.find((p) => p.token.symbol === "STRK");
  if (!strkPool) throw new Error("No STRK pool found");
  return strkPool;
}

type Step = "input" | "deploying" | "staking" | "success" | "error";

const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export default function StakeFlow() {
  const { starknetAddress: accountAddress, authCredentials } = useAuth();
  const [step, setStep] = useState<Step>("input");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasLoggedRef = useRef(false);

  useEffect(() => {
    if (!hasLoggedRef.current) {
      hasLoggedRef.current = true;
      resolveStrkPool()
        .then((pool) => {
          console.log("[StakeFlow] Pool resolved:", pool.poolContract);
        })
        .catch(console.error);
    }
  }, []);

  // const buildSignerAndWallet = async () => {
  //   const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });

  //   const starknetAddressLocal = accountAddress;
  //   if (!starknetAddressLocal || !authCredentials) {
  //     setStep("input");
  //     return;
  //   }

  //   const nonceResult = await provider.callContract({
  //     contractAddress: accountAddress,
  //     entrypoint: "get_nonce",
  //     calldata: [],
  //   });
  //   const nonceDecimal = nonceResult[0]
  //     ? BigInt(nonceResult[0]).toString()
  //     : "0";

  //   const signer = new SatKeySigner({
  //     proverUrl: PROVER_URL,
  //     btcProofInputs: {
  //       pubkey: authCredentials.pubkey,
  //       signature_r: authCredentials.signature_r,
  //       signature_s: authCredentials.signature_s,
  //       message_hash: authCredentials.message_hash,
  //       expiry: authCredentials.expiry,
  //       salt: authCredentials.salt,
  //       nonce: nonceDecimal,
  //     },
  //   });

  //   const wallet = await sdk.connectWallet({
  //     account: {
  //       signer,
  //       accountClass: {
  //         classHash: process.env.NEXT_PUBLIC_SATKEY_CLASS_HASH!,
  //         buildConstructorCalldata: (publicKey: string) => [
  //           // publicKey = num.toHex(salt) from SatKeySigner.getPubKey()
  //           // Matches constructor: (verifier_class_hash, public_key_salt)
  //           process.env.NEXT_PUBLIC_VERIFIER_CLASS_HASH!,
  //           publicKey,
  //         ],
  //         getSalt: (publicKey: string) => publicKey,
  //         // Salt for address derivation = public_key_salt, which getPubKey() returns directly
  //       },
  //     },
  //   });

  //   return wallet;
  // };

  const handleStake = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;

    try {
      setStep("deploying");
      const starknetAddressLocal = accountAddress;
      if (!starknetAddressLocal || !authCredentials) {
        setStep("input");
        return;
      }
      const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });

      const nonceResult = await provider.callContract({
        contractAddress: accountAddress!,
        entrypoint: "get_nonce",
        calldata: [],
      });
      const nonceDecimal = nonceResult[0]
        ? BigInt(nonceResult[0]).toString()
        : "0";

      const signer = new SatKeySigner({
        proverUrl: PROVER_URL,
        btcProofInputs: {
          pubkey: authCredentials.pubkey,
          signature_r: authCredentials.signature_r,
          signature_s: authCredentials.signature_s,
          message_hash: authCredentials.message_hash,
          expiry: authCredentials.expiry,
          salt: authCredentials.salt,
          nonce: nonceDecimal,
        },
      });

      const account = new Account({
        provider,
        address: accountAddress,
        signer,
      });

      const pool = await resolveStrkPool();
      console.log("[StakeFlow] Resolved pool:", pool.poolContract);

      const decimals = pool.token.decimals ?? 18;
      const amountU128 = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));


      // Check membership via direct RPC
      let isMember = false;
      try {
        const result = await provider.callContract({
          contractAddress: pool.poolContract,
          entrypoint: "get_pool_member_info",
          calldata: [accountAddress],
        });
        isMember = result.length > 0 && BigInt(result[0]) !== 0n;
      } catch {
        isMember = false;
      }

      const approveCall = {
        contractAddress: STRK_TOKEN,
        entrypoint: "approve",
        calldata: CallData.compile({
          spender: pool.poolContract,
          amount: uint256.bnToUint256(amountU128), // ERC20 approve still takes u256
        }),
      };


      const stakeCall = isMember
        ? {
            contractAddress: pool.poolContract,
            entrypoint: "add_to_delegation_pool",
            calldata: CallData.compile({
              reward_address: accountAddress,
              amount: amountU128, // u128 — single felt
            }),
          }
        : {
            contractAddress: pool.poolContract,
            entrypoint: "enter_delegation_pool",
            calldata: CallData.compile({
              reward_address: accountAddress,
              amount: amountU128, // u128 — single felt
            }),
          };

        setStep("staking");

        const feeEstimate = await provider.getBlockWithTxHashes('latest') as any;
        const l1GasPrice = BigInt(feeEstimate?.l1_gas_price?.price_in_fri ?? '0x2540BE400');
        const l1DataGasPrice = BigInt(feeEstimate?.l1_data_gas_price?.price_in_fri ?? '0x2540BE400');
        const l2GasPrice = BigInt(feeEstimate?.l2_gas_price?.price_in_fri ?? '0x174876E800');

        const { transaction_hash } = await account.execute(
          [approveCall, stakeCall],
          {
            resourceBounds: {
              l1_gas: {
                max_amount: 10_000n,
                max_price_per_unit: l1GasPrice * 2n,
              },
              l2_gas: {
                max_amount: 1_150_000_000n,
                max_price_per_unit: l2GasPrice * 2n,
              },
              l1_data_gas: {
                max_amount: 10_000n,
                max_price_per_unit: l1DataGasPrice * 2n,
              },
            },
          }
        );


      await provider.waitForTransaction(transaction_hash);

      setTxHash(transaction_hash);
      setStep("success");
    } catch (err) {
      console.error("[StakeFlow] Error:", err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  };

  const resetFlow = () => {
    setStep("input");
    setAmount("");
    setTxHash(null);
    setErrorMsg(null);
  };

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Ambient Glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/20 to-amber-500/20 rounded-[2.5rem] blur-2xl opacity-50" />

      {/* Main Card */}
      <div className="relative overflow-hidden rounded-[2rem] bg-black/40 backdrop-blur-2xl border border-white/10 p-8 shadow-2xl min-h-[400px] flex flex-col justify-center">
        <AnimatePresence mode="wait">

          {/* ── Step 1: Input ── */}
          {step === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col h-full justify-between gap-8"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-medium tracking-tight text-white">
                  Stake STRK
                </h2>
                <p className="text-sm text-white/50">
                  Enter the amount of STRK you want to stake on Starknet.
                </p>
              </div>

              <div className="relative group">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d*$/.test(val)) setAmount(val);
                  }}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 pl-6 pr-20 text-4xl font-light tracking-tighter text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                />
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <span className="text-sm font-medium text-white/40 uppercase tracking-wider">
                    STRK
                  </span>
                </div>
              </div>

              <button
                onClick={handleStake}
                disabled={!amount || Number(amount) <= 0}
                className={cn(
                  "w-full py-4 rounded-xl font-medium tracking-wide transition-all duration-300",
                  amount && Number(amount) > 0
                    ? "bg-orange-500 text-black hover:bg-orange-400 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:-translate-y-0.5"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
                )}
              >
                Continue to Stake
              </button>
            </motion.div>
          )}

          {/* ── Step 2: Connecting / deploying ── */}
          {step === "deploying" && (
            <LoadingStep
              key="deploying"
              title="Connecting Wallet"
              subtitle="Generating ZK proof..."
            />
          )}

          {/* ── Step 3: Staking tx ── */}
          {step === "staking" && (
            <LoadingStep
              key="staking"
              title="Executing Stake"
              subtitle="Submitting to Starknet..."
            />
          )}

          {/* ── Step 4: Success ── */}
          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col items-center justify-center text-center gap-6"
            >
              <div className="relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
                  className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30"
                >
                  <svg
                    className="w-10 h-10 text-orange-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <motion.path
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </motion.div>
                <div className="absolute inset-0 bg-orange-500 blur-2xl opacity-20 rounded-full" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-medium text-white">Stake Successful</h3>
                <p className="text-white/50">
                  You staked{" "}
                  <span className="text-white font-medium">{amount} STRK</span>
                </p>
              </div>

              <div className="w-full bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col gap-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-white/40">Transaction Hash</span>
                  <a
                    href={`https://sepolia.voyager.online/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 font-mono hover:text-orange-300 transition-colors"
                  >
                    {txHash ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}` : "—"}
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/40">Network</span>
                  <span className="text-white">Starknet Sepolia</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/40">Amount</span>
                  <span className="text-white">{amount} STRK</span>
                </div>
              </div>

              <button
                onClick={resetFlow}
                className="w-full py-4 mt-4 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-colors border border-white/5"
              >
                Done
              </button>
            </motion.div>
          )}

          {/* ── Step 5: Error ── */}
          {step === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center text-center gap-6"
            >
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30">
                <svg
                  className="w-10 h-10 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-medium text-white">Stake Failed</h3>
                <p className="text-sm text-white/40 break-all max-w-xs">{errorMsg}</p>
              </div>
              <button
                onClick={resetFlow}
                className="w-full py-4 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-colors border border-white/5"
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

function LoadingStep({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col items-center justify-center text-center gap-8 h-full py-8"
    >
      <div className="relative w-24 h-24 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-t-2 border-r-2 border-orange-500/30"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-2 rounded-full border-b-2 border-l-2 border-orange-500/60"
        />
        <motion.div
          animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="w-4 h-4 rounded-full bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.8)]"
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-medium text-white tracking-tight">{title}</h3>
        <p className="text-sm text-orange-400/80 animate-pulse">{subtitle}</p>
      </div>
    </motion.div>
  );
}