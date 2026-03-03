"use client";

import Wallet, { AddressPurpose, RpcErrorCode } from "sats-connect";
import { Key } from "lucide-react";
import { useAuth, Address } from "@/providers/AuthProvider";
import Profile from "./Profile";

interface ConnectProps {
  onConnect?: () => void;
}

const Connect = ({ onConnect }: ConnectProps) => {
  const {
    isConnected,
    setIsConnected,
    setAddresses,
    setBtcPubkeyHex,
  } = useAuth();

  if (isConnected) {
    return <Profile />;
  }

  const onClick = async () => {
    try {
      // Using 'getAccounts' instead of 'wallet_connect' for multi-wallet compatibility (UniSat/Leather/Xverse)
      // Note: UniSat only supports Bitcoin purposes. Including Stacks/Starknet causes an error.
      const response = await Wallet.request('getAccounts', {
        purposes: [
          AddressPurpose.Ordinals,
          AddressPurpose.Payment,
        ],
        message: 'Connect to Sat Key',
      });

      if (response.status === 'success') {
        const addresses = response.result as Address[];
        
        // Update auth state
        setAddresses(addresses);
        setIsConnected(true);

        // Store raw pubkey hex for ZK proving
        const paymentAddress = addresses.find(
          (addr) => addr.purpose === AddressPurpose.Payment
        );
        const ordinalsAddress = addresses.find(
          (addr) => addr.purpose === AddressPurpose.Ordinals
        );

        // FOR ECDSA ZK AUTH: We MUST use the Payment address (Native Segwit) pubkey.
        const pubkey = paymentAddress?.publicKey || ordinalsAddress?.publicKey;
        if (pubkey) {
          setBtcPubkeyHex(pubkey);
        }
        onConnect?.();
      } else {
        if (response.error?.code === RpcErrorCode.USER_REJECTION) {
          console.log('User rejected connection request');
        } else {
          console.error('Wallet connection error:', response.error);
        }
      }
    } catch (err: any) {
      console.error('Connection failed:', err?.message || err);
    }
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
