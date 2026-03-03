"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/providers/AuthProvider";
import { formatStarknetAddress } from "@/lib/starknet";
import { ChevronDown, LogOut, Wallet, Key, Bitcoin, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Profile() {
  const {
    isConnected,
    addresses,
    starknetAddress,
    resetAll,
  } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isConnected) return null;

  // Get the primary BTC address (e.g., payment or ordinals)
  const btcAddress = addresses?.[0]?.address || "";
  const truncatedBtc = btcAddress ? `${btcAddress.slice(0, 6)}...${btcAddress.slice(-4)}` : "Unknown";
  const formattedStarknet = starknetAddress ? formatStarknetAddress(starknetAddress) : "Not derived";

  const handleDisconnect = async () => {
    await resetAll();
    setIsOpen(false);
  };

  return (
    <div className="relative z-[70]" ref={dropdownRef}>
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "group relative flex items-center gap-2.5 px-1.5 py-1.5 pr-4 bg-white/5 backdrop-blur-md text-white rounded-full font-light tracking-wide transition-all duration-500 hover:bg-white/10 border border-white/10 hover:border-white/20 hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]",
          isOpen && "bg-white/10 border-white/20 shadow-[0_0_20px_rgba(249,115,22,0.15)]"
        )}
      >
        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-linear-to-br from-orange-400/20 to-orange-600/20 border border-orange-400/30 text-orange-400 overflow-hidden">
          <div className="absolute inset-0 bg-orange-400/10 blur-md"></div>
          <Bitcoin className="w-4 h-4 relative z-10" />
          {/* Connected Indicator */}
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0a0a0a] z-20"></span>
        </div>
        <span className="text-sm font-medium tracking-wider">{truncatedBtc}</span>
        <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform duration-500 group-hover:text-white/70", isOpen && "rotate-180 text-white/90")} />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, scale: 0.96, filter: "blur(4px)" }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="absolute z-1000 right-0 mt-3 w-80 p-1.5 bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7)] overflow-hidden"
          >
            {/* Decorative Background Elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

            <div className="relative p-5 flex flex-col gap-6">
              {/* BTC Address Section */}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="flex items-start gap-4"
              >
                <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-white/70 shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="flex flex-col pt-0.5">
                  <span className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-semibold mb-1">Bitcoin Wallet</span>
                  <span className="text-sm text-white/90 font-mono tracking-wider">{truncatedBtc}</span>
                </div>
              </motion.div>

              {/* Connection Link Visual */}
              <div className="relative h-8 -my-4 ml-5 flex items-center">
                <div className="absolute top-0 bottom-0 left-4.75 w-px bg-linear-to-b from-white/10 via-orange-400/30 to-orange-400/10"></div>
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="absolute left-2.75 bg-[#0a0a0a] p-1 rounded-full border border-white/10 text-white/30"
                >
                  <Link2 className="w-3 h-3" />
                </motion.div>
              </div>

              {/* Starknet Address Section */}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="flex items-start gap-4 relative"
              >
                <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-orange-400/10 border border-orange-400/20 text-orange-400 shrink-0 overflow-hidden">
                  <div className="absolute inset-0 bg-linear-to-br from-orange-400/20 to-transparent opacity-50"></div>
                  <Key className="w-5 h-5 relative z-10" />
                </div>
                <div className="flex flex-col pt-0.5">
                  <span className="text-[10px] text-orange-400/70 uppercase tracking-[0.2em] font-semibold mb-1">Starknet Identity</span>
                  <span className="text-sm text-white/90 font-mono tracking-wider">{formattedStarknet}</span>
                  <p className="text-[11px] text-white/40 mt-2 leading-relaxed font-light">
                    Your Bitcoin key controls Starknet.
                  </p>
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="p-2 mt-2"
            >
              <button
                onClick={handleDisconnect}
                className="group relative w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm text-white/60 hover:text-red-400 bg-white/5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-300 overflow-hidden hover:cursor-pointer"
              >
                <div className="absolute inset-0 bg-linear-to-r from-red-500/0 via-red-500/5 to-red-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                <span className="font-medium tracking-wide">Disconnect</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
