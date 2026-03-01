"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

export default function StakeFlow() {
  const [step, setStep] = useState<Step>(1);
  const [amount, setAmount] = useState("");

  // Mock the staking process
  useEffect(() => {
    if (step === 2) {
      const timer = setTimeout(() => setStep(3), 2500);
      return () => clearTimeout(timer);
    }
    if (step === 3) {
      const timer = setTimeout(() => setStep(4), 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleStake = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    setStep(2);
  };

  const resetFlow = () => {
    setStep(1);
    setAmount("");
  };

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Ambient Glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/20 to-amber-500/20 rounded-[2.5rem] blur-2xl opacity-50" />

      {/* Main Card */}
      <div className="relative overflow-hidden rounded-[2rem] bg-black/40 backdrop-blur-2xl border border-white/10 p-8 shadow-2xl min-h-[400px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col h-full justify-between gap-8"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-medium tracking-tight text-white">
                  Stake BTC
                </h2>
                <p className="text-sm text-white/50">
                  Enter the amount of Bitcoin you want to stake on Starknet.
                </p>
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-2xl font-light text-white/30">₿</span>
                </div>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    // Only allow numbers and decimals
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d*$/.test(val)) {
                      setAmount(val);
                    }
                  }}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-6 pl-12 pr-16 text-4xl font-light tracking-tighter text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                />
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <span className="text-sm font-medium text-white/40 uppercase tracking-wider">
                    BTC
                  </span>
                </div>
              </div>

              <button
                onClick={handleStake}
                disabled={!amount || Number(amount) <= 0}
                className={cn(
                  "w-full py-4 rounded-xl font-medium tracking-wide transition-all duration-300",
                  amount && Number(amount) > 0
                    ? "bg-orange-500 text-black hover:bg-orange-400 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:-translate-y-0.5"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
                )}
              >
                Continue to Stake
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <LoadingStep
              key="step-2"
              title="Deploying Starknet Account"
              subtitle="(Gasless Transaction)"
            />
          )}

          {step === 3 && (
            <LoadingStep
              key="step-3"
              title="Executing Vault Stake"
              subtitle="Securing your assets..."
            />
          )}

          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col items-center justify-center text-center gap-6"
            >
              <div className="relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 20,
                    delay: 0.2,
                  }}
                  className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30"
                >
                  <svg
                    className="w-10 h-10 text-orange-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <motion.path
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </motion.div>
                {/* Success Glow */}
                <div className="absolute inset-0 bg-orange-500 blur-2xl opacity-20 rounded-full" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-medium text-white">
                  Stake Successful
                </h3>
                <p className="text-white/50">
                  You have successfully staked{" "}
                  <span className="text-white font-medium">{amount} BTC</span>
                </p>
              </div>

              <div className="w-full bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col gap-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-white/40">Transaction Hash</span>
                  <span className="text-orange-400 font-mono">
                    0x7f...3a9b
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/40">Network</span>
                  <span className="text-white">Starknet</span>
                </div>
              </div>

              <button
                onClick={resetFlow}
                className="w-full py-4 mt-4 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-colors border border-white/5"
              >
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LoadingStep({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col items-center justify-center text-center gap-8 h-full py-8"
    >
      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Outer rotating ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-t-2 border-r-2 border-orange-500/30"
        />
        {/* Inner rotating ring (opposite direction) */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-2 rounded-full border-b-2 border-l-2 border-orange-500/60"
        />
        {/* Center pulsing dot */}
        <motion.div
          animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="w-4 h-4 rounded-full bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.8)]"
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-medium text-white tracking-tight">
          {title}
        </h3>
        <p className="text-sm text-orange-400/80 animate-pulse">{subtitle}</p>
      </div>
    </motion.div>
  );
}
