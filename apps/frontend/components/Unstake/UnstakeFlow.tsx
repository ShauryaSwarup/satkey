"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownToLine, CheckCircle2, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type UnstakeStep = "input" | "signing" | "relaying" | "success";

export function UnstakeFlow() {
  const [step, setStep] = useState<UnstakeStep>("input");
  const [amount, setAmount] = useState("");
  const [isHovered, setIsHovered] = useState(false);

  const STAKED_BALANCE = 0.42; // Mock balance

  const handleUnstake = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0 || Number(amount) > STAKED_BALANCE) {
      return;
    }
    
    setStep("signing");
    
    // Mock signing delay
    setTimeout(() => {
      setStep("relaying");
      
      // Mock relaying delay
      setTimeout(() => {
        setStep("success");
      }, 3000);
    }, 2000);
  };

  const resetFlow = () => {
    setStep("input");
    setAmount("");
  };

  const setMaxAmount = () => {
    setAmount(STAKED_BALANCE.toString());
  };

  const variants = {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const } },
    exit: { opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const } }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative overflow-hidden rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl shadow-orange-500/5">
        {/* Decorative top gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-600/0 via-orange-500 to-orange-600/0 opacity-50" />
        
        <div className="p-8 min-h-[400px] flex flex-col justify-center relative z-10">
          <AnimatePresence mode="wait">
            {step === "input" && (
              <motion.div
                key="input"
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col gap-6"
              >
                <div className="space-y-2 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 mb-2">
                    <ArrowDownToLine className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-medium text-white tracking-tight">Unstake BTC</h2>
                  <p className="text-sm text-white/60">Withdraw your staked Bitcoin to your wallet</p>
                </div>

                <div className="space-y-4 mt-4">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-sm text-white/60">Staked Balance</span>
                    <span className="text-sm font-medium text-white flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-orange-500" />
                      {STAKED_BALANCE} BTC
                    </span>
                  </div>

                  <div className="relative group">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-3xl font-light text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                      <span className="text-white/40 font-medium">BTC</span>
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
                  onClick={handleUnstake}
                  disabled={!amount || Number(amount) <= 0 || Number(amount) > STAKED_BALANCE}
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
                    <motion.span
                      animate={{ x: isHovered ? 4 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      →
                    </motion.span>
                  </span>
                </button>
              </motion.div>
            )}

            {step === "signing" && (
              <motion.div
                key="signing"
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col items-center justify-center text-center gap-6 py-8"
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
                  <div className="relative bg-black/50 border border-white/10 w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-md">
                    <ShieldCheck className="w-8 h-8 text-orange-500" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">Sign Request</h3>
                  <p className="text-sm text-white/60 max-w-[260px] mx-auto">
                    Please sign the BIP-322 message in your wallet to authorize the withdrawal.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-orange-500/80 bg-orange-500/10 px-4 py-2 rounded-full mt-4">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Waiting for signature...
                </div>
              </motion.div>
            )}

            {step === "relaying" && (
              <motion.div
                key="relaying"
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col items-center justify-center text-center gap-6 py-8"
              >
                <div className="relative">
                  <svg className="w-24 h-24 text-white/10" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-orange-500"
                      strokeDasharray="283"
                      initial={{ strokeDashoffset: 283 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: 3, ease: "linear" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-medium text-white">Executing Unstake</h3>
                  <p className="text-sm text-white/60 max-w-[260px] mx-auto">
                    The relayer is processing your withdrawal on Starknet.
                  </p>
                </div>
              </motion.div>
            )}

            {step === "success" && (
              <motion.div
                key="success"
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-col items-center justify-center text-center gap-6 py-4"
              >
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30"
                >
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </motion.div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-medium text-white">Unstake Complete</h3>
                  <p className="text-sm text-white/60">
                    Successfully withdrew <span className="text-white font-medium">{amount} BTC</span>
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
                    <a href="#" className="text-orange-500 hover:text-orange-400 transition-colors font-mono">
                      0x8f...3a9b
                    </a>
                  </div>
                </div>

                <button
                  onClick={resetFlow}
                  className="w-full rounded-2xl bg-white/10 hover:bg-white/15 text-white font-medium py-4 mt-4 transition-colors"
                >
                  Done
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
