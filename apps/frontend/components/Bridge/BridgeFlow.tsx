"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Copy, Check, Loader2, Bitcoin, ArrowDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "input" | "deposit" | "confirming" | "success";

export function BridgeFlow() {
  const [step, setStep] = useState<Step>("input");
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmations, setConfirmations] = useState(0);

  const depositAddress = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
  const requiredConfirmations = 3;

  // Mock the bridge process
  useEffect(() => {
    if (step === "confirming") {
      const interval = setInterval(() => {
        setConfirmations((prev) => {
          if (prev >= requiredConfirmations) {
            clearInterval(interval);
            setTimeout(() => setStep("success"), 1000);
            return prev;
          }
          return prev + 1;
        });
      }, 3000); // 3 seconds per mock confirmation
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    setStep("deposit");
  };

  const handleSimulateDeposit = () => {
    setStep("confirming");
  };

  const resetFlow = () => {
    setStep("input");
    setAmount("");
    setConfirmations(0);
  };

  const variants = {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -20, scale: 0.95 },
  };

  return (
    <div className="w-full max-w-md mx-auto relative">
      {/* Decorative background glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/20 to-amber-500/20 rounded-3xl blur-xl opacity-50" />
      
      <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 overflow-hidden shadow-2xl">
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div
              key="input"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 mb-2">
                  <Bitcoin className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-white">Bridge BTC</h2>
                <p className="text-white/60 text-sm">
                  Move Bitcoin to Starknet via Atomiq
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/80">Amount to Bridge</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-4 pr-16 text-2xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <span className="text-white/60 font-medium">BTC</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center py-2">
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                    <ArrowDown className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center relative overflow-hidden">
                      <span className="text-blue-400 text-xs font-bold">SN</span>
                    </div>
                    <div>
                      <p className="text-white font-medium">Receive wBTC</p>
                      <p className="text-white/40 text-xs">On Starknet</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-medium">{amount || "0.00"}</p>
                    <p className="text-white/40 text-xs">~${(Number(amount || 0) * 65000).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleContinue}
                disabled={!amount || Number(amount) <= 0}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === "deposit" && (
            <motion.div
              key="deposit"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 mb-2">
                  <ArrowDown className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-white">Deposit BTC</h2>
                <p className="text-white/60 text-sm">
                  Send exactly <span className="text-orange-400 font-mono">{amount} BTC</span> to the address below
                </p>
              </div>

              <div className="p-1 rounded-2xl bg-gradient-to-b from-white/10 to-transparent">
                <div className="bg-black/60 rounded-xl p-4 flex flex-col items-center gap-4">
                  {/* Mock QR Code */}
                  <div className="w-48 h-48 bg-white rounded-lg p-2 flex items-center justify-center">
                    <div className="w-full h-full border-4 border-black border-dashed opacity-20 flex items-center justify-center">
                      <span className="text-black font-bold text-xs">QR CODE</span>
                    </div>
                  </div>
                  
                  <div className="w-full space-y-2">
                    <label className="text-xs text-white/40 uppercase tracking-wider font-semibold px-1">Atomiq Deposit Address</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 font-mono text-sm text-white/80 truncate">
                        {depositAddress}
                      </div>
                      <button
                        onClick={handleCopy}
                        className="p-3 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
                      >
                        {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-start gap-3">
                <Loader2 className="w-5 h-5 text-orange-400 animate-spin flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-200/80">
                  Waiting for your deposit. This screen will update automatically once the transaction is detected.
                </p>
              </div>

              {/* Hidden button to simulate deposit for demo purposes */}
              <button
                onClick={handleSimulateDeposit}
                className="w-full py-2 text-white/20 text-xs hover:text-white/40 transition-colors"
              >
                (Simulate Deposit Detected)
              </button>
            </motion.div>
          )}

          {step === "confirming" && (
            <motion.div
              key="confirming"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-8 py-8"
            >
              <div className="text-center space-y-4">
                <div className="relative w-24 h-24 mx-auto">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      className="text-white/10 stroke-current"
                      strokeWidth="4"
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                    ></circle>
                    <motion.circle
                      className="text-orange-500 stroke-current"
                      strokeWidth="4"
                      strokeLinecap="round"
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      initial={{ strokeDasharray: "251.2", strokeDashoffset: "251.2" }}
                      animate={{ strokeDashoffset: 251.2 - (251.2 * confirmations) / requiredConfirmations }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                    ></motion.circle>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-2xl font-bold text-white">{confirmations}</span>
                    <span className="text-xs text-white/40">/ {requiredConfirmations}</span>
                  </div>
                </div>
                
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Confirming</h2>
                  <p className="text-white/60 text-sm">
                    Waiting for Bitcoin network confirmations...
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-500",
                      confirmations >= i ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40"
                    )}>
                      {confirmations >= i ? <Check className="w-3 h-3" /> : i}
                    </div>
                    <div className="flex-1">
                      <p className={cn(
                        "text-sm font-medium transition-colors duration-500",
                        confirmations >= i ? "text-white" : "text-white/40"
                      )}>
                        Confirmation {i}
                      </p>
                    </div>
                  </div>
                ))}
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
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-8 py-8 text-center"
            >
              <div className="relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 12, stiffness: 100, delay: 0.1 }}
                  className="w-24 h-24 mx-auto bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(52,211,153,0.4)]"
                >
                  <Check className="w-12 h-12 text-white" />
                </motion.div>
              </div>

              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-white">Bridged!</h2>
                <p className="text-white/60">
                  Successfully minted <span className="text-white font-medium">{amount} wBTC</span> on Starknet.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 inline-flex items-center gap-3 mx-auto">
                <div className="text-left">
                  <p className="text-xs text-white/40 uppercase tracking-wider">Transaction ID</p>
                  <p className="text-sm text-white font-mono">0x8f...3a9b</p>
                </div>
                <a href="#" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              <button
                onClick={resetFlow}
                className="w-full py-4 rounded-xl bg-white/10 text-white font-bold text-lg hover:bg-white/20 transition-colors"
              >
                Bridge More
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
