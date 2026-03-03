"use client";

import { Key } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import Profile from "./Profile";

interface ConnectProps {
  onConnect?: () => void;
}

const Connect = ({ onConnect }: ConnectProps) => {
  const {
    isConnected,
    connect
  } = useAuth();

  if (isConnected) {
    return <Profile />;
  }

  const onClick = async () => {
    await connect();
    onConnect?.();
  };

  return (
    <button 
      onClick={onClick} 
      className="p-2.5 border-white/10 border-[1px] group relative inline-flex items-center bg-white/10 backdrop-blur-md text-white rounded-full font-light tracking-wide overflow-hidden transition-all duration-300 hover:bg-white/20 hover:scale-105 active:scale-95 text-sm md:text-base hover:cursor-pointer"
    >
      <span className="relative z-10 text-orange-400 mx-1">Connect Wallet</span>
      <Key className="w-4 h-4 relative z-10 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
};

export default Connect;
