"use client";

import { AddressPurpose, request, RpcErrorCode, BitcoinNetworkType } from "sats-connect";
import { Key } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import Profile from "./Profile";
interface ConnectProps {
  onConnect?: () => void;
}

const Connect = ({ onConnect }: ConnectProps) => {
  const {
    isConnected,
    setIsConnected,
    setWalletType,
    setWalletId,
    setAddresses,
    setNetwork,
    setBtcPubkeyHex,
  } = useAuth();

  if (isConnected) {
    return <Profile />;
  }

  const onClick = async () => {
    try {
      const response = await request('wallet_connect', {
        // @ts-expect-error - sats-connect types mismatch
        payload: {
          network: {
            type: BitcoinNetworkType.Testnet, // Default to testnet for MVP
          },
          purposes: [
            AddressPurpose.Ordinals,
            AddressPurpose.Payment,
            AddressPurpose.Stacks,
          ],
        },
      });

      if (response.status === 'success') {
        const result = response.result;
        
        // Update auth state
        setWalletType(result.walletType || null);
        setWalletId(result.id || null);
        // @ts-expect-error - sats-connect types mismatch
        setAddresses(result.addresses || []);
        setNetwork(result.network || null);
        setIsConnected(true);

        // Store raw pubkey hex for ZK proving — do NOT hash or derive here
        // Starknet address will be computed after successful ZK auth
        const paymentAddress = result.addresses?.find(
          (addr: { purpose: string }) => addr.purpose === AddressPurpose.Payment
        );
        const ordinalsAddress = result.addresses?.find(
          (addr: { purpose: string }) => addr.purpose === AddressPurpose.Ordinals
        );

        // FOR ECDSA ZK AUTH: We MUST use the Payment address (Native Segwit) pubkey.
        // Ordinals addresses use Taproot (Schnorr) which our circuit doesn't support yet.
        const pubkey = paymentAddress?.publicKey || ordinalsAddress?.publicKey;
        if (pubkey) {
          // Store raw pubkey — ZkAuthFlow will derive salt + address after proving
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
      className="p-2 group relative inline-flex items-center bg-white/10 backdrop-blur-md text-white rounded-full font-light tracking-wide overflow-hidden transition-all duration-300 hover:bg-white/20 hover:scale-105 active:scale-95 text-sm md:text-base hover:cursor-pointer"
    >
      <span className="relative z-10 text-orange-400 mx-1">Connect Wallet</span>
      <Key className="w-4 h-4 relative z-10 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
};

export default Connect;
