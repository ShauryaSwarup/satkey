"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownToLine, CheckCircle2, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { sepoliaValidators } from "starkzap";
import { sdk } from "@/lib/starkzap";
import { Account, CallData, RpcProvider } from "starknet";
import { SatKeySigner } from "@/models/SatKeySigner";
import { useAuth } from "@/providers/AuthProvider";

const STARKNET_RPC_URL = process.env.NEXT_PUBLIC_STARKNET_RPC_URL!;
const PROVER_URL = process.env.NEXT_PUBLIC_PROVER_URL || "http://localhost:3001";
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

async function resolveStrkPool() {
  const [firstValidator] = Object.values(sepoliaValidators);
  const pools = await sdk.getStakerPools(firstValidator.stakerAddress);
  const strkPool = pools.find((p) => p.token.symbol === "STRK");
  if (!strkPool) throw new Error("No STRK pool found");
  return {strkPool, firstValidator};
}

type UnstakeStep = "input" | "signing" | "relaying" | "success" | "error";

export function UnstakeFlow() {
  const { starknetAddress: accountAddress, authCredentials } = useAuth();
  const [step, setStep] = useState<UnstakeStep>("input");
  const [validator, setValidator] = useState<any | null>(null);
  const [pool, setPool] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [stakedBalance, setStakedBalance] = useState<string>("0");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!accountAddress) return;
    (async () => {
      try {
        const {strkPool: pool, firstValidator}= await resolveStrkPool();
        setPool(pool);
        setValidator(firstValidator);
        const result = await new RpcProvider({ nodeUrl: STARKNET_RPC_URL }).callContract({
          contractAddress: pool.poolContract,
          entrypoint: "get_pool_member_info_v1",
          calldata: [accountAddress],
        });
        console.log("[UnstakeFlow] get_pool_member_info result:", result);
        // result[0] is amount staked as u128 felt
        const raw = result[2] ? BigInt(result[2]) : 0n;
        const decimals = pool.token.decimals ?? 18;
        const formatted = (Number(raw) / 10 ** decimals).toFixed(4);
        setStakedBalance(formatted);
      } catch (err) {
        console.error("[UnstakeFlow] Error fetching staked balance:", err);
        setStakedBalance("0");
      }
    })();
  }, [accountAddress]);

  const buildAccount = async (provider: RpcProvider) => {
    const nonceResult = await provider.callContract({
      contractAddress: accountAddress!,
      entrypoint: "get_nonce",
      calldata: [],
    });
    const nonceDecimal = nonceResult[0] ? BigInt(nonceResult[0]).toString() : "0";

    const signer = new SatKeySigner({
      proverUrl: PROVER_URL,
      btcProofInputs: {
        pubkey: authCredentials!.pubkey,
        signature_r: authCredentials!.signature_r,
        signature_s: authCredentials!.signature_s,
        message_hash: authCredentials!.message_hash,
        expiry: authCredentials!.expiry,
        salt: authCredentials!.salt,
        nonce: nonceDecimal,
      },
    });

    return new Account({ provider, address: accountAddress!, signer });
  };

  const getResourceBounds = async (provider: RpcProvider) => {
    const block = await provider.getBlockWithTxHashes("latest") as any;
    const l1GasPrice = BigInt(block?.l1_gas_price?.price_in_fri ?? "0x2540BE400");
    const l1DataGasPrice = BigInt(block?.l1_data_gas_price?.price_in_fri ?? "0x2540BE400");
    const l2GasPrice = BigInt(block?.l2_gas_price?.price_in_fri ?? "0x174876E800");
    return {
      l1_gas: { max_amount: 10_000n, max_price_per_unit: l1GasPrice * 2n },
      l2_gas: { max_amount: 1_150_000_000n, max_price_per_unit: l2GasPrice * 2n },
      l1_data_gas: { max_amount: 10_000n, max_price_per_unit: l1DataGasPrice * 2n },
    };
  };

  const handleUnstake = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0 || Number(amount) > Number(stakedBalance)) return;
    if (!accountAddress || !authCredentials) return;

    try {
      setStep("signing");

      const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
      const account = await buildAccount(provider);
      const {strkPool: pool}= await resolveStrkPool();

      const decimals = pool.token.decimals ?? 18;
      const amountU128 = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));

      const exitIntentCall = {
        contractAddress: pool.poolContract,
        entrypoint: "exit_delegation_pool_intent",
        calldata: CallData.compile({
          amount: amountU128,
        }),
      };

      setStep("relaying");

      const resourceBounds = await getResourceBounds(provider);
      const { transaction_hash } = await account.execute([exitIntentCall], { resourceBounds });
      await provider.waitForTransaction(transaction_hash);

      setTxHash(transaction_hash);
      setStep("success");
    } catch (err) {
      console.error("[UnstakeFlow] Error:", err);
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

  const setMaxAmount = () => setAmount(stakedBalance);

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
            {step === "input" && (
              <motion.div key="input" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-6">
                <div className="space-y-2 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 mb-2">
                    <ArrowDownToLine className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-medium text-white tracking-tight">Unstake STRK</h2>
                  <p className="text-sm text-white/60">Initiate withdrawal of your staked STRK</p>
                </div>

                <div className="space-y-4 mt-4">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-sm text-white/60">Staked Balance</span>
                    <span className="text-sm font-medium text-white flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-orange-500" />
                      {stakedBalance} STRK
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

                  <p className="text-xs text-white/40 px-1">
                    Note: Unstaking initiates a cooldown period before tokens are returned to your wallet.
                  </p>
                </div>

                <button
                  onClick={handleUnstake}
                  disabled={!amount || Number(amount) <= 0 || Number(amount) > Number(stakedBalance)}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                  className={cn(
                    "relative w-full group overflow-hidden rounded-2xl bg-orange-500 text-white font-medium py-4 mt-2 transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_40px_-10px_rgba(249,115,22,0.5)]"
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-orange-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Initiate Unstake
                    <motion.span animate={{ x: isHovered ? 4 : 0 }} transition={{ duration: 0.2 }}>→</motion.span>
                  </span>
                </button>
              </motion.div>
            )}

            {step === "signing" && (
              <motion.div key="signing" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-center text-center gap-6 py-8">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
                  <div className="relative bg-black/50 border border-white/10 w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-md">
                    <ShieldCheck className="w-8 h-8 text-orange-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">Generating Proof</h3>
                  <p className="text-sm text-white/60 max-w-[260px] mx-auto">
                    Generating your ZK proof to authorize the unstake transaction.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-orange-500/80 bg-orange-500/10 px-4 py-2 rounded-full mt-4">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Waiting for proof...
                </div>
              </motion.div>
            )}

            {step === "relaying" && (
              <motion.div key="relaying" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-center text-center gap-6 py-8">
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
                  <h3 className="text-xl font-medium text-white">Submitting Unstake</h3>
                  <p className="text-sm text-white/60 max-w-[260px] mx-auto">
                    Processing your withdrawal on Starknet.
                  </p>
                </div>
              </motion.div>
            )}

            {step === "success" && (
              <motion.div key="success" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-center text-center gap-6 py-4">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30"
                >
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </motion.div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-medium text-white">Unstake Initiated</h3>
                  <p className="text-sm text-white/60">
                    <span className="text-white font-medium">{amount} STRK</span> is entering the cooldown period.
                  </p>
                </div>

                <div className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 mt-2">
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-white/50">Status</span>
                    <span className="text-green-400 font-medium flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
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
                </div>

                <button onClick={resetFlow} className="w-full rounded-2xl bg-white/10 hover:bg-white/15 text-white font-medium py-4 mt-4 transition-colors">
                  Done
                </button>
              </motion.div>
            )}

            {step === "error" && (
              <motion.div key="error" variants={variants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-center text-center gap-6 py-4">
                <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30">
                  <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">Unstake Failed</h3>
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
