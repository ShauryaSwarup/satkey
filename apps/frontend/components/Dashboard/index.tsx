"use client";

import { useAuth } from "@/providers/AuthProvider";
import { motion } from "framer-motion";
import {
  Wallet,
  ArrowRightLeft,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
  Clock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Gift,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Account, CallData, RpcProvider } from "starknet";
import { sepoliaValidators } from "starkzap";
import { sdk } from "@/lib/starkzap";
import { createClient } from "@/lib/supabase/client";
import { ActiveSwap } from "@/lib/supabase/types";
import { getAtomiqFactory, getAtomiqSwapper } from "@/lib/atomiq";
import { AddressPurpose } from "sats-connect";
import { SatKeySigner } from "@/models/SatKeySigner";

const STARKNET_RPC_URL = process.env.NEXT_PUBLIC_STARKNET_RPC_URL!;
const PROVER_URL = process.env.NEXT_PUBLIC_PROVER_URL || "http://localhost:3001";

async function resolveStrkPool() {
  const [firstValidator] = Object.values(sepoliaValidators);
  const pools = await sdk.getStakerPools(firstValidator.stakerAddress);
  const strkPool = pools.find((p) => p.token.symbol === "STRK");
  if (!strkPool) throw new Error("No STRK pool found");
  return {strkPool, firstValidator};
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 15 },
  },
};

interface StakingPosition {
  staked: string;
  rewards: string;
  unpooling: string;
  unpoolTime: Date | null;
}

export default function Dashboard() {
  const supabase = useMemo(() => createClient(), []);
  const { addresses, network, starknetAddress, authCredentials } = useAuth();
  const [position, setPosition] = useState<any>();
  const [positionLoading, setPositionLoading] = useState(true);
  const [validator, setValidator] = useState<any | null>(null);
  const [pool, setPool] = useState<any | null>(null);

  // Track client mount to avoid SSR/hydration visual mismatch for conditionally
  // rendered action cards that depend on client-only async data.
  const [mounted, setMounted] = useState(false);
  const [swaps, setSwaps] = useState<ActiveSwap[]>([]);
  const [swapsLoading, setSwapsLoading] = useState(true);
  const [isLoadingBTCBalance, setIsLoadingBTCBalance] = useState(false);
  const [isLoadingSTRKBalance, setIsLoadingSTRKBalance] = useState(false);
  const [btcBalance, setBtcBalance] = useState<string | null>(null);
  const [strkBalance, setStrkBalance] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const primaryAddress = addresses?.[0]?.address || "";
  const shortAddress = primaryAddress
    ? `${primaryAddress.slice(0, 6)}...${primaryAddress.slice(-4)}`
    : "Not connected";

  const canWithdraw =
    position &&
    parseFloat(position.unpooling) > 0 &&
    position.unpoolTime !== null &&
    new Date() >= position.unpoolTime;

  const unpoolCountdown =
    position?.unpoolTime && new Date() < position.unpoolTime
      ? position.unpoolTime
      : null;

  console.log("[Dashboard] Network:", network);
  console.log("[Dashboard] Starknet Address:", starknetAddress);

  // ── Account builder ──────────────────────────────────────────────────────
  const buildAccount = useCallback(
    async (provider: RpcProvider) => {
      if (!starknetAddress || !authCredentials) throw new Error("Not authenticated");
      const nonceResult = await provider.callContract({
        contractAddress: starknetAddress,
        entrypoint: "get_nonce",
        calldata: [],
      });
      const nonceDecimal = nonceResult[0] ? BigInt(nonceResult[0]).toString() : "0";
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
      return new Account({ provider, address: starknetAddress, signer });
    },
    [starknetAddress, authCredentials]
  );

  const getResourceBounds = useCallback(async (provider: RpcProvider) => {
    const block = (await provider.getBlockWithTxHashes("latest")) as any;
    const l1GasPrice = BigInt(block?.l1_gas_price?.price_in_fri ?? "0x2540BE400");
    const l1DataGasPrice = BigInt(block?.l1_data_gas_price?.price_in_fri ?? "0x2540BE400");
    const l2GasPrice = BigInt(block?.l2_gas_price?.price_in_fri ?? "0x174876E800");
    return {
      l1_gas: { max_amount: 10_000n, max_price_per_unit: l1GasPrice * 2n },
      l2_gas: { max_amount: 1_150_000_000n, max_price_per_unit: l2GasPrice * 2n },
      l1_data_gas: { max_amount: 10_000n, max_price_per_unit: l1DataGasPrice * 2n },
    };
  }, []);

  // ── Fetch position ────────────────────────────────────────────────────────
  const fetchPosition = useCallback(async () => {
    if (!starknetAddress) { setPositionLoading(false); return; }
    setPositionLoading(true);
    try {
      const {strkPool: pool, firstValidator}= await resolveStrkPool();
      setPool(pool);
      setValidator(firstValidator);
      const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
      const result = await provider.callContract({
        contractAddress: pool.poolContract,
        entrypoint: "get_pool_member_info_v1",
        calldata: [starknetAddress],
      });
      console.log("[Dashboard] get_pool_member_info_v1 result:", result);
      const decimals = pool.token.decimals ?? 18;
      const fmt = (raw: bigint) => (Number(raw) / 10 ** decimals).toFixed(4);

      // [0] reward_address, [1] commission, [2] amount, [3] unclaimed_rewards, [4] unpool_amount, [5] unpool_time
      const staked   = result[2] ? fmt(BigInt(result[2])) : "0.0000";
      const rewards  = result[3] ? fmt(BigInt(result[3])) : "0.0000";
      const unpooling = result[5] ? fmt(BigInt(result[5])) : "0.0000";
      const unpoolTimestamp = result[7] ? Number(BigInt(result[7])) : 0;
      const unpoolTime = unpoolTimestamp > 0 ? new Date(unpoolTimestamp * 1000) : null;

      setPosition({ staked, rewards, unpooling, unpoolTime });
      console.log("[Dashboard] Fetched position:", { staked, rewards, unpooling, unpoolTime });
    } catch {
      setPosition({ staked: "0.0000", rewards: "0.0000", unpooling: "0.0000", unpoolTime: null });
    } finally {
      setPositionLoading(false);
    }
  }, [starknetAddress]);

  useEffect(() => { fetchPosition(); }, [fetchPosition]);

  // ── Claim rewards ─────────────────────────────────────────────────────────
  const handleClaimRewards = async () => {
    if (!starknetAddress || !authCredentials) return;
    setClaimLoading(true);
    setActionError(null);
    setClaimTxHash(null);
    try {
      const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
      const account = await buildAccount(provider);
      const {strkPool: pool} = await resolveStrkPool();
      const resourceBounds = await getResourceBounds(provider);

      const { transaction_hash } = await account.execute(
        [{
          contractAddress: pool.poolContract,
          entrypoint: "claim_rewards",
          calldata: CallData.compile({ pool_member: starknetAddress }),
        }],
        { resourceBounds }
      );

      await provider.waitForTransaction(transaction_hash);
      setClaimTxHash(transaction_hash);
      await fetchPosition();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaimLoading(false);
    }
  };

  // ── Complete withdrawal ───────────────────────────────────────────────────
  const handleCompleteWithdrawal = async () => {
    if (!starknetAddress || !authCredentials) return;
    setWithdrawLoading(true);
    setActionError(null);
    setWithdrawTxHash(null);
    try {
      const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
      const account = await buildAccount(provider);
      const {strkPool: pool} = await resolveStrkPool();
      const resourceBounds = await getResourceBounds(provider);

      const { transaction_hash } = await account.execute(
        [{
          contractAddress: pool.poolContract,
          entrypoint: "exit_delegation_pool_action",
          calldata: CallData.compile({ pool_member: starknetAddress }),
        }],
        { resourceBounds }
      );

      await provider.waitForTransaction(transaction_hash);
      setWithdrawTxHash(transaction_hash);
      await fetchPosition();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setWithdrawLoading(false);
    }
  };

  // ── BTC balance ───────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchBtcBalance = async () => {
      if (!addresses.length) return;
      setIsLoadingBTCBalance(true);
      try {
        const swapper = await getAtomiqSwapper();
        const paymentAddress = addresses.find((a) => a.purpose === AddressPurpose.Payment)?.address;
        if (!paymentAddress) return;
        const btcResult = await swapper!.Utils.getBitcoinSpendableBalance(paymentAddress, "STARKNET");
        const btcBal = btcResult?.balance?.amount ?? (btcResult as any)?.amount ?? null;
        setBtcBalance(btcBal ?? null);
      } catch (err) {
        console.error("Failed to fetch BTC balance:", err);
      } finally {
        setIsLoadingBTCBalance(false);
      }
    };
    fetchBtcBalance();
  }, [addresses]);

  // ── STRK balance ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchStrkBalance = async () => {
      if (!starknetAddress || !authCredentials) return;
      setIsLoadingSTRKBalance(true);
      try {
        const swapper = await getAtomiqSwapper();
        const factory = getAtomiqFactory();
        const balance = await swapper!.Utils.getSpendableBalance(starknetAddress, factory.Tokens.STARKNET.STRK);
        setStrkBalance(balance.amount);
      } catch (err) {
        console.error("Failed to fetch STRK balance:", err);
      } finally {
        setIsLoadingSTRKBalance(false);
      }
    };
    fetchStrkBalance();
  }, [starknetAddress, authCredentials]);

  // ── Swap history ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authCredentials?.pubkey) { setSwapsLoading(false); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from("active_swaps")
          .select("*")
          .eq("btc_pubkey", authCredentials.pubkey)
          .order("created_at", { ascending: false })
          .limit(10);
        setSwaps(data ?? []);
      } catch {
        setSwaps([]);
      } finally {
        setSwapsLoading(false);
      }
    })();
  }, [authCredentials?.pubkey, supabase]);

  // Log debug info only on the client after mount so server logs don't mislead
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    console.log("[Dashboard Debug]", {
      position,
      positionLoading,
      rewardsValue: position?.rewards,
      rewardsNumber: Number(position?.rewards),
      shouldShowSection: position && (Number(position.rewards) > 0 || Number(position.unpooling) > 0),
    });
  }, [mounted, position, positionLoading]);

  console.log("Position:", position);
  return (
    <div className="min-h-screen bg-black pt-24 pb-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-orange-500/10 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-orange-600/5 blur-[150px] pointer-events-none rounded-full" />

      <motion.div className="max-w-7xl mx-auto relative z-10" variants={containerVariants} initial="hidden" animate="visible">

        {/* Header */}
        <motion.div variants={itemVariants} className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">Dashboard</h1>
            <p className="text-white/50 text-lg">Welcome back. Here&apos;s your staking overview.</p>
          </div>
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.3)]">
              <Wallet className="text-white h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-white/50 font-medium mb-1">Connected Wallet</div>
              <div className="flex items-center gap-2">
                <span className="text-white font-mono">{shortAddress}</span>
                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium border border-green-500/20">
                  {network?.bitcoin.name || "Mainnet"}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Main Position Card */}
          <motion.div variants={itemVariants} className="lg:col-span-2 relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-orange-600/20 rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />
            <div className="relative h-full bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-xl overflow-hidden">
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
              <div className="flex flex-col h-full justify-between relative z-10">
                <div>
                  <div className="flex items-center gap-2 text-orange-400 mb-2">
                    <TrendingUp className="h-5 w-5" />
                    <span className="font-medium tracking-wide uppercase text-sm">Total Staked Position</span>
                  </div>
                  {positionLoading ? (
                    <div className="flex items-center gap-3 mt-4">
                      <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                      <span className="text-white/40">Loading position...</span>
                    </div>
                  ) : (
                                        <>
                                          <div className="flex items-start justify-between gap-6 mb-1">

                                            {/* Staked Balance */}
                                            <div>
                                              <div className="flex items-baseline gap-3">
                                                <span className="text-5xl md:text-7xl font-bold text-white tracking-tighter">
                                                  {position?.staked ?? "0.0000"}
                                                </span>
                                                <span className="text-2xl text-white/50 font-medium">STRK</span>
                                              </div>

                                              {position && parseFloat(position.unpooling) > 0 && (
                                                <div className="text-yellow-400/80 text-sm mt-1 flex items-center gap-1">
                                                  <Clock className="h-3 w-3" />
                                                  {position.unpooling} STRK pending withdrawal
                                                </div>
                                              )}
                                            </div>

                                            {/* Validator Pool Card */}
                                            {validator && pool && (
                                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4 min-w-[220px]">
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
                          </div>
                        )}

                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-6 mt-10 pt-8 border-t border-white/10">
                  <div>
                    <div className="text-white/50 text-sm mb-1">Unclaimed Rewards</div>
                    {positionLoading ? (
                      <div className="h-8 w-24 bg-white/10 rounded animate-pulse" />
                    ) : (
                      <div className="text-2xl font-bold text-green-400">
                        +{position?.rewards ?? "0.0000"}{" "}
                        <span className="text-green-400/50 text-lg">STRK</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-white/50 text-sm mb-1">Starknet Address</div>
                    {starknetAddress ? (
                      <a
                        href={`https://sepolia.voyager.online/contract/${starknetAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-400 font-mono text-sm hover:text-orange-300 transition-colors flex items-center gap-1"
                      >
                        {`${starknetAddress.slice(0, 6)}...${starknetAddress.slice(-4)}`}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-white/30 text-sm">Not deployed</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div variants={itemVariants} className="flex flex-col gap-4">
            <ActionCard title="Stake More" description="Deposit STRK to earn yield" icon={<ArrowDownToLine className="h-6 w-6" />} href="/stake" primary />
            <ActionCard title="Bridge BTC" description="Move assets to Starknet" icon={<ArrowRightLeft className="h-6 w-6" />} href="/bridge" />
            <ActionCard title="Unstake" description="Withdraw your position" icon={<ArrowUpFromLine className="h-6 w-6" />} href="/unstake" />
          </motion.div>
        </div>
        {/* Claim Rewards + Complete Withdrawal */}
        {mounted && !positionLoading && position && (
                <motion.div
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 sm:grid-cols-2 gap-6"
                >
                  {/* Claim Rewards */}
                  <div className="relative group">
                    <div className="absolute inset-0 bg-green-500/10 rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />
                    <div className="relative bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
                      <div className="flex items-center gap-2 text-green-400 mb-3">
                        <Gift className="h-5 w-5" />
                        <span className="font-medium text-sm uppercase tracking-wide">Rewards Available</span>
                      </div>
                      <div className="text-3xl font-bold text-white mb-1">
                        {position.rewards} <span className="text-white/40 text-xl">STRK</span>
                      </div>
                      <p className="text-white/40 text-sm mb-5">Accumulated staking rewards ready to claim</p>
        
                      {claimTxHash ? (
                        <a
                          href={`https://sepolia.voyager.online/tx/${claimTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-green-400 text-sm hover:text-green-300 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Claimed · View tx
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <button
                          onClick={handleClaimRewards}
                          disabled={claimLoading || Number(position.rewards) === 0}
                          className="w-full py-3 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {claimLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Claiming...
                            </>
                          ) : (
                            <>
                              <Gift className="h-4 w-4" /> Claim Rewards
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
        
                  {/* Complete Withdrawal */}
                  <div className="relative group">
                    <div
                      className={cn(
                        "absolute inset-0 rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity duration-500",
                        canWithdraw ? "bg-orange-500/10" : "bg-yellow-500/10"
                      )}
                    />
                    <div className="relative bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
                      <div
                        className={cn(
                          "flex items-center gap-2 mb-3",
                          canWithdraw ? "text-orange-400" : "text-yellow-400"
                        )}
                      >
                        <Unlock className="h-5 w-5" />
                        <span className="font-medium text-sm uppercase tracking-wide">
                          {canWithdraw ? "Withdrawal Ready" : "Cooldown Period"}
                        </span>
                      </div>
                      <div className="text-3xl font-bold text-white mb-1">
                        {position.unpooling} <span className="text-white/40 text-xl">STRK</span>
                      </div>
                      {unpoolCountdown ? (
                        <p className="text-yellow-400/70 text-sm mb-5">
                          Available on {unpoolCountdown.toLocaleDateString()} at {unpoolCountdown.toLocaleTimeString()}
                        </p>
                      ) : (
                        <p className="text-white/40 text-sm mb-5">Ready to withdraw</p>
                      )}
        
                      {withdrawTxHash ? (
                        <a
                          href={`https://sepolia.voyager.online/tx/${withdrawTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-orange-400 text-sm hover:text-orange-300 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Withdrawn · View tx
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <button
                          onClick={handleCompleteWithdrawal}
                          disabled={
                            !canWithdraw ||
                            withdrawLoading ||
                            Number(position.unpooling) === 0
                          }
                          className="w-full py-3 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-400 font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {withdrawLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                            </>
                          ) : (
                            <>
                              <Unlock className="h-4 w-4" /> {canWithdraw ? "Complete Withdrawal" : "Cooldown Active"}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
        

        {/* Action Error */}
        {actionError && (
          <motion.div variants={itemVariants} className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm break-all">
            {actionError}
          </motion.div>
        )}

        {/* Wallet Balances */}
        <motion.div variants={itemVariants} className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 md:p-8 backdrop-blur-sm mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-white/5 rounded-xl">
              <Wallet className="h-5 w-5 text-white/70" />
            </div>
            <h2 className="text-xl font-semibold text-white">Wallet Balances</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="text-white/50 text-sm mb-2">Bitcoin Balance</div>
              {isLoadingBTCBalance ? (
                <div className="flex items-center gap-2 text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
              ) : (
                <div className="text-2xl font-bold text-orange-400">{btcBalance ?? "0"} <span className="text-white/40 text-base">BTC</span></div>
              )}
            </div>
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="text-white/50 text-sm mb-2">Available STRK</div>
              {isLoadingSTRKBalance ? (
                <div className="flex items-center gap-2 text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
              ) : (
                <div className="text-2xl font-bold text-green-400">{strkBalance ?? "0"} <span className="text-white/40 text-base">STRK</span></div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={itemVariants} className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 md:p-8 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-white/5 rounded-xl">
              <Activity className="h-5 w-5 text-white/70" />
            </div>
            <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
          </div>

          {swapsLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
              <span className="text-white/40">Loading activity...</span>
            </div>
          ) : swaps.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-white/10 mx-auto mb-3" />
              <p className="text-white/40">No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {swaps.map((swap) => (
                <div
                  key={swap.created_at}
                  className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      swap.swap_type === "STRK_TO_BTC" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"
                    )}>
                      {swap.swap_type === "STRK_TO_BTC" ? <ArrowUpFromLine className="h-5 w-5" /> : <ArrowDownToLine className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="text-white font-medium">
                        {swap.swap_type === "STRK_TO_BTC" ? "STRK → BTC" : "BTC → STRK"}
                      </div>
                      <div className="text-white/40 text-sm flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(swap.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-white font-medium">
                        {swap.amount} {swap.swap_type === "STRK_TO_BTC" ? "STRK" : "BTC"}
                      </div>
                      <div className="flex items-center justify-end gap-1 text-sm">
                        {swap.swap_state === 6 ? (
                          <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</span>
                        ) : (
                          <span className="text-yellow-400 flex items-center gap-1"><Clock className="h-3 w-3" /> {swap.swap_state ?? "Pending"}</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={swap.swap_type === "STRK_TO_BTC" ? `https://sepolia.voyager.online/tx/${swap.tx_id}` : `https://mempool.space/testnet4/tx/${swap.tx_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-white/30 hover:text-orange-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

function ActionCard({ title, description, icon, href, primary = false }: {
  title: string; description: string; icon: React.ReactNode; href: string; primary?: boolean;
}) {
  return (
    <Link href={href} className={cn(
      "flex items-center gap-4 p-5 rounded-2xl text-left transition-all duration-300 group relative overflow-hidden",
      primary
        ? "bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 border-none shadow-[0_0_30px_rgba(249,115,22,0.2)] hover:shadow-[0_0_40px_rgba(249,115,22,0.4)]"
        : "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20"
    )}>
      {primary && (
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%,100%_100%] bg-[position:200%_0,0_0] bg-no-repeat transition-[background-position_0s_ease] hover:bg-[position:-100%_0,0_0] hover:duration-[1500ms]" />
      )}
      <div className={cn(
        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110",
        primary ? "bg-white/20 text-white" : "bg-white/5 text-white/70 group-hover:text-white"
      )}>
        {icon}
      </div>
      <div className="relative z-10">
        <div className="font-semibold text-lg mb-0.5 text-white">{title}</div>
        <div className={cn("text-sm", primary ? "text-white/80" : "text-white/50")}>{description}</div>
      </div>
    </Link>
  );
}
