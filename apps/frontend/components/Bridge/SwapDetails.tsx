"use client";

import { motion } from "framer-motion";
import { ArrowRightLeft, CheckCircle2, XCircle, Clock, ExternalLink, Coins, Receipt, Wallet } from "lucide-react";
import { ActiveSwap } from "@/lib/supabase/types";
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

interface SwapDetailsProps {
  swap: ActiveSwap;
}

const getStatusInfo = (swapState: number) => {
  if (swapState === SpvFromBTCSwapState.CLAIM_CLAIMED) {
    return { label: "Completed", color: "text-green-400", bg: "bg-green-500/20", icon: CheckCircle2 };
  }
  if (swapState === SpvFromBTCSwapState.FAILED || swapState === SpvFromBTCSwapState.CLOSED) {
    return { label: "Failed", color: "text-red-400", bg: "bg-red-500/20", icon: XCircle };
  }
  if (swapState === SpvFromBTCSwapState.DECLINED) {
    return { label: "Declined", color: "text-red-400", bg: "bg-red-500/20", icon: XCircle };
  }
  if (swapState < 0) {
    return { label: "Expired", color: "text-amber-400", bg: "bg-amber-500/20", icon: Clock };
  }
  return { label: "In Progress", color: "text-orange-400", bg: "bg-orange-500/20", icon: Clock };
};

export function SwapDetails({ swap }: SwapDetailsProps) {
  const isReversed = swap.swap_type === "STRK_TO_BTC";
  const status = getStatusInfo(swap.swap_state);
  const StatusIcon = status.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 py-4"
    >
      {/* Header with status */}
      <div className="text-center space-y-4">
        <div className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium", status.bg, status.color)}>
          <StatusIcon className="w-4 h-4" />
          {status.label}
        </div>
        
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-orange-500" />
            <span className="text-2xl font-bold text-white">
              {swap.amount}
            </span>
            <span className="text-white/60">{isReversed ? "STRK" : "BTC"}</span>
          </div>
          <ArrowRightLeft className="w-5 h-5 text-white/30" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-white">
              {swap.output_amount}
            </span>
            <span className="text-white/60">{isReversed ? "BTC" : "STRK"}</span>
          </div>
        </div>
        
        <p className="text-white/60 text-sm">
          {isReversed 
            ? `Swapped ${swap.amount} STRK for Bitcoin` 
            : `Sent ${swap.amount} BTC to Starknet`}
        </p>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
          <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-1">
            <Receipt className="w-3 h-3" /> Input
          </p>
          <p className="text-white font-medium">{swap.input_amount}</p>
        </div>
        
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
          <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-1">
            <Coins className="w-3 h-3" /> Output
          </p>
          <p className="text-white font-medium">{swap.output_amount}</p>
        </div>
        
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
          <p className="text-xs text-white/40 uppercase tracking-wider">Fee</p>
          <p className="text-white font-medium">{swap.fee} {isReversed ? "STRK" : "BTC"}</p>
        </div>
        
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
          <p className="text-xs text-white/40 uppercase tracking-wider">Confirmations</p>
          <p className="text-white font-medium">{swap.confirmations} / 1</p>
        </div>
      </div>

      {/* Transaction ID */}
      {swap.tx_id && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Transaction ID</p>
            <p className="text-sm text-white font-mono truncate">{swap.tx_id}</p>
          </div>
          <a 
            href={isReversed
              ? `https://sepolia.voyager.online/tx/${swap.tx_id}`
              : `https://mempool.space/testnet4/tx/${swap.tx_id}`
            } 
            target="_blank" rel="noreferrer" 
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors ml-3 shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Recipient Address */}
      {swap.starknet_address && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-1">
          <p className="text-xs text-white/40 uppercase tracking-wider flex items-center gap-1">
            <Wallet className="w-3 h-3" /> Recipient
          </p>
          <p className="text-white font-mono text-sm truncate">{swap.starknet_address}</p>
        </div>
      )}

      {/* Timestamp */}
      <div className="flex items-center justify-between text-xs text-white/40 pt-2 border-t border-white/10">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(swap.created_at).toLocaleString()}
        </span>
        <span>State: {swap.swap_state}</span>
      </div>
    </motion.div>
  );
}
