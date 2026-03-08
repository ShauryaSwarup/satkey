"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Bitcoin, ArrowRightLeft } from "lucide-react";
import { getAtomiqSwapper } from "@/lib/atomiq";
import Wallet, { AddressPurpose } from "sats-connect";
import { useAuth } from "@/providers/AuthProvider";

interface BridgeInputProps {
  amount: string;
  setAmount: (amount: string) => void;
  onContinue: () => void;
  isProcessing: boolean;
  error: string | null;
  starknetAddress: string | null;
  balance: string | null;
  isLoadingBalance: boolean;
  isReversed: boolean;
  setIsReversed: (reversed: boolean) => void;
  outputAmount: string;
  setOutputAmount: (amount: string) => void;
  isFetchingQuote: boolean;
}

export function BridgeInput({ amount, setAmount, onContinue, isProcessing, error, starknetAddress, balance, isLoadingBalance, isReversed, setIsReversed, outputAmount, setOutputAmount, isFetchingQuote }: BridgeInputProps) {
  const [feeRate, setFeeRate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { addresses } = useAuth();

  useEffect(() => {
    const fetchFeeRate = async () => {
      if (isReversed) return;
      if (!addresses.length || isReversed) return;
      setIsLoading(true);
      try {
        const swapper = await getAtomiqSwapper();
        const paymentAddress = addresses.find(a => a.purpose === AddressPurpose.Payment)?.address;
        if (!paymentAddress) return;
        if (swapper) {
          const { feeRate: btcFeeRate } = await swapper.Utils.getBitcoinSpendableBalance(paymentAddress, "STARKNET");
          setFeeRate(btcFeeRate?.toString() || null);
        }
      } catch (err) {
        console.error('Failed to fetch fee rate:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFeeRate();
  }, [addresses, isReversed]);

  const setPercentage = (percent: number) => {
    if (balance) {
      const value = (Number(balance) * percent / 100).toFixed(8);
      setAmount(value);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 mb-2">
          <Bitcoin className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-white">Bridge BTC</h2>
        <p className="text-white/60 text-sm">Move Bitcoin to Starknet via Atomiq</p>
      </div>

      <div className="space-y-4">
        {/* FROM Box */}
        <div className="relative">
          <div className="absolute -top-2 left-4 bg-black px-2">
            <span className="text-xs font-medium text-white/60">FROM</span>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-white/80">{isReversed ? "STRK" : "BTC"}</label>
              {isLoadingBalance ? (
                <span className="text-xs text-white/40">Loading...</span>
              ) : balance ? (
                <button
                  onClick={() => setAmount(balance)}
                  className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Balance: {Number(balance).toFixed(8)} {isReversed ? "STRK" : "BTC"}
                </button>
              ) : null}
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent text-2xl text-white placeholder:text-white/20 focus:outline-none"
            />
            {!isReversed && feeRate === null && !isLoading && <p className="text-xs text-red-400">Failed to fetch fee rate</p>}
            {!isReversed && isLoading && <p className="text-xs text-white/40">Loading fee rate...</p>}
            {!isReversed && feeRate && <p className="text-xs text-white/40">Fee Rate: {feeRate} sat/vB</p>}
          </div>
          {/* Percentage Buttons */}
          <div className="flex gap-2 mt-2">
            {[25, 50, 75].map((percent) => (
              <button
                key={percent}
                onClick={() => setPercentage(percent)}
                className="flex-1 py-1 text-xs rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              >
                {percent}%
              </button>
            ))}
            <button
              onClick={() => setAmount(balance || "")}
              className="flex-1 py-1 text-xs rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors font-medium"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center">
          <button
            onClick={() => {
              setIsReversed(!isReversed);
              setAmount("");
              setOutputAmount("");
            }}
            className="w-12 h-12 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center text-white hover:opacity-90 transition-opacity"
          >
            <ArrowRightLeft className="w-5 h-5" />
          </button>
        </div>

        {/* TO Box */}
        <div className="relative">
          <div className="absolute -top-2 left-4 bg-black px-2">
            <span className="text-xs font-medium text-white/60">TO</span>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-sm font-medium text-white/80 mb-2">You receive</p>
            <p className="text-2xl text-white font-medium">
              {isFetchingQuote ? <Loader2 className="w-6 h-6 animate-spin inline" /> : (outputAmount || "~")}
            </p>
            <p className="text-xs text-white/40 mt-2">On {isReversed ? "Bitcoin" : "Starknet"}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={onContinue}
        disabled={!amount || Number(amount) <= 0 || !starknetAddress || isProcessing || (!!balance && Number(amount) > Number(balance))}
        className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-5 h-5" /></>}
      </button>
    </motion.div>
  );
}
