"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpFromLine, CheckCircle2, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { sepoliaValidators, Amount } from "starkzap";
import { sdk } from "@/lib/starkzap";
import { Account, CallData, RpcProvider, uint256 } from "starknet";
import { SatKeySigner } from "@/models/SatKeySigner";
import { useAuth } from "@/providers/AuthProvider";
import Image from "next/image";

const STARKNET_RPC_URL = process.env.NEXT_PUBLIC_STARKNET_RPC_URL!;
const PROVER_URL = process.env.NEXT_PUBLIC_PROVER_URL || "http://localhost:3001";
const avnuApiKey = "cc98d665-ba65-4483-8f1f-4b4d25a750ce";

// Grab the first sepolia validator's STRK pool
async function resolveStrkPool() {
  const [firstValidator] = Object.values(sepoliaValidators);
  const pools = await sdk.getStakerPools(firstValidator.stakerAddress);
  const strkPool = pools.find((p) => p.token.symbol === "STRK");
  if (!strkPool) throw new Error("No STRK pool found");
  return {strkPool, firstValidator};
}

type Step = "input" | "deploying" | "staking" | "success" | "error";

const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export default function StakeFlow() {
  const { starknetAddress: accountAddress, authCredentials } = useAuth();
  const [validator, setValidator] = useState<any | null>(null);
  const [pool, setPool] = useState<any | null>(null);
  const [step, setStep] = useState<Step>("input");
  const hasLoggedRef = useRef(false);
  const [amount, setAmount] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [strkBalance, setStrkBalance] = useState<string>("0");
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  
  // Fetch STRK balance
  useEffect(() => {
    if (!accountAddress || !authCredentials) return;
    
    const fetchStrkBalance = async () => {
      setIsLoadingBalance(true);
      try {
        const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
        const result = await provider.callContract({
          contractAddress: STRK_TOKEN,
          entrypoint: "balance_of",
          calldata: [accountAddress],
        });
        
        const raw = result[0] ? BigInt(result[0]) : 0n;
        const decimals = 18;
        const formatted = (Number(raw) / 10 ** decimals).toFixed(4);
        setStrkBalance(formatted);
      } catch (err) {
        console.error("[StakeFlow] Error fetching STRK balance:", err);
        setStrkBalance("0");
      } finally {
        setIsLoadingBalance(false);
      }
    };
    
    fetchStrkBalance();
  }, [accountAddress, authCredentials]);

  useEffect(() => {
    const func = async() => {
      const {strkPool, firstValidator} = await resolveStrkPool();
      setPool(strkPool);
      setValidator(firstValidator);
    }
    if (!hasLoggedRef.current) {
      hasLoggedRef.current = true;
      func();
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
    
    // Check if amount exceeds balance
    if (Number(amount) > Number(strkBalance)) return;

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

      const {strkPool: pool} = await resolveStrkPool();
      console.log("[StakeFlow] Resolved pool:", pool.poolContract);

      const decimals = pool.token.decimals ?? 18;
      const amountU128 = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));


      // Check membership via direct RPC
      let isMember = false;
      try {
        const result = await provider.callContract({
          contractAddress: pool.poolContract,
          entrypoint: "get_pool_member_info_v1",
          calldata: [accountAddress],
        });
        // Option::Some = discriminant 0, Option::None = discriminant 1
        // result[0] is the Option tag: 0 = Some, 1 = None
        isMember = result.length > 0 && BigInt(result[0]) === 0n;
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
              pool_member: accountAddress,
              amount: amountU128,
            }),
          }
        : {
            contractAddress: pool.poolContract,
            entrypoint: "enter_delegation_pool",
            calldata: CallData.compile({
              reward_address: accountAddress,
              amount: amountU128,
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

  const setMaxAmount = () => setAmount(strkBalance);

  const variants = {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const } },
    exit: { opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const } },
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative overflow-hidden rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl shadow-orange-500/5">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-600/0 via-orange-500 to-orange-600/0 opacity-50" />

        <div className="p-8 min-h-[400px] flex flex-col justify-center relative z-10">
          <AnimatePresence mode="wait">

            {/* ── Step 1: Input ── */}
            {step === "input" && (
              <motion.div key="input" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-6">
                <div className="space-y-2 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 mb-2">
                    <ArrowUpFromLine className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-medium text-white tracking-tight">Stake STRK</h2>
                  <p className="text-sm text-white/60">Enter the amount of STRK you want to stake on Starknet.</p>
                </div>

                <div className="space-y-4 mt-4">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-sm text-white/60">Available Balance</span>
                    <span className="text-sm font-medium text-white flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-orange-500" />
                      {isLoadingBalance ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                      ) : (
                        `${strkBalance} STRK`
                      )}
                    </span>
                  </div>
                  {validator && pool && (
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4">
                      <img
                        src={validator.logoUrl}
                        alt={validator.name}
                        width={40}
                        height={40}
                        className="rounded-lg"
                      />
                      <div className="flex flex-col">
                        <span className="text-white font-medium text-sm">
                          {validator.name}
                        </span>

                        <span className="text-white/50 text-xs">
                          Validator Pool
                        </span>

                        <span className="text-orange-400 text-xs font-mono">
                          {pool.poolContract.slice(0, 8)}...
                          {pool.poolContract.slice(-6)}
                        </span>
                      </div>

                      <div className="ml-auto text-right">
                        <div className="text-white text-sm font-medium">
                          {pool.token.symbol}
                        </div>

                        <div className="text-xs text-white/40">
                          Delegation Pool
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="relative group">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) setAmount(val);
                      }}
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-3xl font-light text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                      <span className="text-white/40 font-medium">STRK</span>
                      <button
                        onClick={setMaxAmount}
                        className="text-xs font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-lg transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleStake}
                  disabled={!amount || Number(amount) <= 0 || Number(amount) > Number(strkBalance)}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                  className={cn(
                    "relative w-full group overflow-hidden rounded-2xl bg-orange-500 text-white font-medium py-4 mt-2 transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_40px_-10px_rgba(249,115,22,0.5)]"
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-orange-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Continue to Stake
                    <motion.span animate={{ x: isHovered ? 4 : 0 }} transition={{ duration: 0.2 }}>→</motion.span>
                  </span>
                </button>
              </motion.div>
            )}

            {/* ── Step 2: Connecting / deploying ── */}
            {step === "deploying" && (
              <motion.div key="deploying" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-center text-center gap-6 py-8">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
                  <div className="relative bg-black/50 border border-white/10 w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-md">
                    <ShieldCheck className="w-8 h-8 text-orange-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">Connecting Wallet</h3>
                  <p className="text-sm text-white/60 max-w-[260px] mx-auto">
                    Generating ZK proof...
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-orange-500/80 bg-orange-500/10 px-4 py-2 rounded-full mt-4">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Waiting for proof...
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Staking tx ── */}
            {step === "staking" && (
              <motion.div key="staking" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-center text-center gap-6 py-8">
                <div className="relative">
                  <svg className="w-24 h-24 text-white/10" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
                    <motion.circle
                      cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2"
                      className="text-orange-500" strokeDasharray="283"
                      initial={{ strokeDashoffset: 283 }} animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: 3, ease: "linear" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">Executing Stake</h3>
                  <p className="text-sm text-white/60 max-w-[260px] mx-auto">
                    Submitting to Starknet...
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── Step 4: Success ── */}
            {step === "success" && (
              <motion.div key="success" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-center text-center gap-6 py-4">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30"
                >
                  <CheckCircle2 className="w-10 h-10 text-orange-500" />
                </motion.div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-medium text-white">Stake Successful</h3>
                  <p className="text-sm text-white/60">
                    You staked <span className="text-white font-medium">{amount} STRK</span>
                  </p>
                </div>

                <div className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 mt-2">
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-white/50">Status</span>
                    <span className="text-orange-400 font-medium flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                      Confirmed
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/50">Transaction</span>
                    <a
                      href={`https://sepolia.voyager.online/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 hover:text-orange-400 transition-colors font-mono"
                    >
                      {txHash ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}` : "—"}
                    </a>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-2">
                    <span className="text-white/50">Network</span>
                    <span className="text-white">Starknet Sepolia</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-2">
                    <span className="text-white/50">Amount</span>
                    <span className="text-white">{amount} STRK</span>
                  </div>
                </div>

                <button onClick={resetFlow} className="w-full rounded-2xl bg-white/10 hover:bg-white/15 text-white font-medium py-4 mt-4 transition-colors">
                  Done
                </button>
              </motion.div>
            )}

            {/* ── Step 5: Error ── */}
            {step === "error" && (
              <motion.div key="error" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-center text-center gap-6 py-4">
                <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30">
                  <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">Stake Failed</h3>
                  <p className="text-sm text-white/40 break-all max-w-xs">{errorMsg}</p>
                </div>
                <button onClick={resetFlow} className="w-full rounded-2xl bg-white/10 hover:bg-white/15 text-white font-medium py-4 transition-colors">
                  Try Again
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
