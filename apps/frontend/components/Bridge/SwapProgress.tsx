"use client";

import { motion } from "framer-motion";
import { Check, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

enum SpvFromBTCSwapState {
  CLOSED = -5,
  FAILED = -4,
  DECLINED = -3,
  QUOTE_EXPIRED = -2,
  QUOTE_SOFT_EXPIRED = -1,
  CREATED = 0,
  SIGNED = 1,
  POSTED = 2,
  BROADCASTED = 3,
  FRONTED = 4,
  BTC_TX_CONFIRMED = 5,
  CLAIM_CLAIMED = 6
}

interface SwapProgressProps {
  confirmations: number;
  swapState: number | null;
  txId: string;
  automaticSettlementFailed: boolean;
  isProcessing: boolean;
  isReversed: boolean;
  onManualClaim: () => void;
}

const REQUIRED_CONFIRMATIONS = 1;

export function SwapProgress({ 
  confirmations, 
  swapState, 
  txId, 
  automaticSettlementFailed, 
  isProcessing, 
  isReversed,
  onManualClaim 
}: SwapProgressProps) {
  // Dynamic labels depending on direction:
  // isReversed === true  => STRK -> BTC
  // isReversed === false => BTC -> STRK
  const header = swapState === SpvFromBTCSwapState.FRONTED ? "Swap Fronted!" : "Confirming";
  const description = swapState === SpvFromBTCSwapState.FRONTED
    ? (isReversed ? "Funds have been sent to your Bitcoin address early!" : "Funds have been sent to your Starknet wallet early!")
    : (isReversed ? "Waiting for Starknet network confirmations..." : "Waiting for Bitcoin network confirmations...");

  const step1Label = isReversed ? "Starknet Transaction Submitted" : "Bitcoin Transaction Broadcasted";
  const step2Label = isReversed ? "Starknet Confirmed" : "Bitcoin Confirmed";
  const step3Label = isReversed ? "Bitcoin Transaction Sent" : "Starknet Funds Claimed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 py-4"
    >
      <div className="text-center space-y-4">
        <div className="relative w-24 h-24 mx-auto">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle className="text-white/10 stroke-current" strokeWidth="4" cx="50" cy="50" r="40" fill="transparent" />
            <motion.circle 
              className="text-orange-500 stroke-current" 
              strokeWidth="4" 
              strokeLinecap="round" 
              cx="50" cy="50" r="40" 
              fill="transparent" 
              initial={{ strokeDasharray: "251.2", strokeDashoffset: "251.2" }}
              animate={{ strokeDashoffset: 251.2 - (251.2 * Math.min(confirmations, REQUIRED_CONFIRMATIONS)) / REQUIRED_CONFIRMATIONS }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-2xl font-bold text-white">{confirmations}</span>
            <span className="text-xs text-white/40">/ {REQUIRED_CONFIRMATIONS}</span>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">{header}</h2>
          <p className="text-white/60 text-sm">{description}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", swapState && swapState >= SpvFromBTCSwapState.BROADCASTED ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40")}>
            {swapState && swapState >= SpvFromBTCSwapState.BROADCASTED ? <Check className="w-3 h-3" /> : "1"}
          </div>
          <p className="text-sm font-medium text-white">{step1Label}</p>
        </div>
        <div className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", confirmations >= REQUIRED_CONFIRMATIONS ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40")}>
            {confirmations >= REQUIRED_CONFIRMATIONS ? <Check className="w-3 h-3" /> : "2"}
          </div>
          <p className="text-sm font-medium text-white">{step2Label}</p>
        </div>
        <div className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", swapState === SpvFromBTCSwapState.CLAIM_CLAIMED ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40")}>
            {swapState === SpvFromBTCSwapState.CLAIM_CLAIMED ? <Check className="w-3 h-3" /> : "3"}
          </div>
          <p className="text-sm font-medium text-white">{step3Label}</p>
        </div>
      </div>

      {txId && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Transaction ID</p>
            <p className="text-sm text-white font-mono">{txId.slice(0, 8)}...{txId.slice(-6)}</p>
          </div>
          <a 
            href={isReversed
                        ? `https://sepolia.voyager.online/tx/${txId}`
                        : `https://mempool.space/testnet4/tx/${txId}`
                  } 
            target="_blank" rel="noreferrer" 
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}

      {automaticSettlementFailed && swapState === SpvFromBTCSwapState.BTC_TX_CONFIRMED && (
        <div className="space-y-3 pt-2">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
            Automatic settlement timed out. Please claim your funds manually.
          </div>
          <button onClick={onManualClaim} disabled={isProcessing} className="w-full py-3 rounded-xl bg-orange-500 text-white font-bold flex items-center justify-center gap-2">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Manual Claim"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
