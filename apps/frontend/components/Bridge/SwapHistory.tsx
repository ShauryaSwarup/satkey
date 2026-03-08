"use client";

import { motion } from "framer-motion";
import { Clock, ExternalLink, History } from "lucide-react";
import { ActiveSwap } from "@/lib/supabase/types";

interface SwapHistoryProps {
  swaps: ActiveSwap[];
  isLoading: boolean;
  onSelectSwap: (swap: ActiveSwap) => void;
}

export function SwapHistory({ swaps, isLoading, onSelectSwap }: SwapHistoryProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <History className="w-5 h-5" />
          Transaction History
        </h3>
        <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/40 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (swaps.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <History className="w-5 h-5" />
          Transaction History
        </h3>
        <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
          <History className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-white/60 font-medium mb-1">No transactions yet</p>
          <p className="text-white/40 text-sm">Your bridge history will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        <History className="w-5 h-5" />
        Transaction History
      </h3>
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
        {swaps.map((swap) => (
          <motion.button
            key={swap.created_at}
            onClick={() => onSelectSwap(swap)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-orange-500/30 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">{swap.amount} BTC</span>
              <span className="text-xs px-2 py-1 rounded-full bg-orange-500/20 text-orange-400">
                {swap.confirmations}/1
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(swap.created_at).toLocaleString()}
              </span>
              <a
                href={`https://mempool.space/testnet4/tx/${swap.tx_id}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-white/40 hover:text-orange-400 transition-colors"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
