"use client";

import { motion } from "framer-motion";
import { Clock, ExternalLink } from "lucide-react";
import { ActiveSwap } from "@/lib/supabase/types";

interface ActiveSwapsListProps {
  swaps: ActiveSwap[];
  onSelectSwap: (swap: ActiveSwap) => void;
}

export function ActiveSwapsList({ swaps, onSelectSwap }: ActiveSwapsListProps) {
  if (swaps.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white">Active Swaps</h3>
      <div className="space-y-3">
        {swaps.map((swap) => (
          <motion.button
            key={swap.btc_pubkey}
            onClick={() => onSelectSwap(swap)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">{swap.amount} BTC</span>
              <span className="text-white/60 text-sm">{swap.confirmations}/1 confirmations</span>
            </div>
            <div className="flex items-center justify-between text-xs text-white/40">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(swap.created_at).toLocaleTimeString()}
              </span>
              <a
                href={`https://mempool.space/testnet4/tx/${swap.tx_id}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 hover:text-orange-400 transition-colors"
              >
                View TX <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
