"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import Wallet from "sats-connect";

export interface Address {
  address: string;
  publicKey: string;
  purpose: string;
  addressType?: string;
  network?: string;
}

export interface Network {
  bitcoin: { name: string };
  stacks: { name: string };
}

export interface Balance {
  confirmed: number;
  unconfirmed: number;
}

export interface AuthContextType {
  isConnected: boolean;
  setIsConnected: (val: boolean) => void;
  walletType: string | null;
  setWalletType: (val: string | null) => void;
  walletId: string | null;
  setWalletId: (val: string | null) => void;
  addresses: Address[];
  setAddresses: (val: Address[]) => void;
  network: Network | null;
  setNetwork: (val: Network | null) => void;
  starknetAddress: string | null;
  setStarknetAddress: (val: string | null) => void;
  btcPubkeyHex: string | null;
  setBtcPubkeyHex: (val: string | null) => void;
  isAuthenticated: boolean;
  setIsAuthenticated: (val: boolean) => void;
  balance: Balance | null;
  setBalance: (val: Balance | null) => void;
  zkProof: { fullProof: string[]; publicSignals: string[] } | null;
  setZkProof: (val: { fullProof: string[]; publicSignals: string[] } | null) => void;
  predictError: string | null;
  setPredictError: (val: string | null) => void;
  isCheckingAccount: boolean;
  resetAll: () => Promise<void>;
  connect: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [walletType, setWalletType] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [network, setNetwork] = useState<Network | null>(null);
  const [starknetAddress, setStarknetAddress] = useState<string | null>(null);
  const [btcPubkeyHex, setBtcPubkeyHex] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [zkProof, setZkProof] = useState<{ fullProof: string[]; publicSignals: string[] } | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [isCheckingAccount, setIsCheckingAccount] = useState<boolean>(false);

  const connect = async () => {
    try {
      const { AddressPurpose, RpcErrorCode } = await import("sats-connect");
      const response = await Wallet.request('getAccounts', {
        purposes: [
          AddressPurpose.Ordinals,
          AddressPurpose.Payment,
        ],
        message: 'Connect to Sat Key',
      });

      if (response.status === 'success') {
        const addresses = response.result as Address[];
        setAddresses(addresses);
        setIsConnected(true);

        const paymentAddress = addresses.find(
          (addr) => addr.purpose === AddressPurpose.Payment
        );
        const ordinalsAddress = addresses.find(
          (addr) => addr.purpose === AddressPurpose.Ordinals
        );

        const pubkey = paymentAddress?.publicKey || ordinalsAddress?.publicKey;
        if (pubkey) {
          setBtcPubkeyHex(pubkey);
        }
      } else {
        const { RpcErrorCode } = await import("sats-connect");
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

  // Reset all auth state to initial values
  const resetAll = async () => {
    try {
      await Wallet.disconnect();
    } catch (err) {
      console.error("[AuthProvider] Failed to disconnect wallet:", err);
    }
    setIsConnected(false);
    setWalletType(null);
    setWalletId(null);
    setAddresses([]);
    setNetwork(null);
    setStarknetAddress(null);
    setBtcPubkeyHex(null);
    setIsAuthenticated(false);
    setBalance(null);
    setZkProof(null);
    setPredictError(null);
    setIsCheckingAccount(false);
  };

  // Fast-Path Login for Returning Users
  useEffect(() => {
    if (isConnected && btcPubkeyHex && !isAuthenticated) {
      const checkReturningUser = async () => {
        setIsCheckingAccount(true);
        try {
          // Calculate address locally using our starknet utils
          const { deriveExpectedAccountAddress, deriveStarknetSalt } = await import('@/lib/starknet');
          const salt = await deriveStarknetSalt(btcPubkeyHex);
          const classHash = process.env.NEXT_PUBLIC_SATKEY_CLASS_HASH || "0x0";
          const verifierAddress = process.env.NEXT_PUBLIC_VERIFIER_ADDRESS || "0x0";

          if (classHash === "0x0" || verifierAddress === "0x0") {
            setPredictError("Frontend not configured with class hash");
            setIsCheckingAccount(false);
            return;
          }

          const accountAddress = deriveExpectedAccountAddress(
            salt,
            classHash,
            [verifierAddress, "0x" + salt.toString(16)]
          );
          setPredictError(null);
          setStarknetAddress(accountAddress);

          // Check deployment status via API
          const res = await fetch('/api/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pubkey: btcPubkeyHex }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.alreadyDeployed) {
              console.log('[AuthProvider] Returning user detected, auto-authenticating:', data.accountAddress);
              setIsAuthenticated(true);
            }
          } else {
            const errorData = await res.json().catch(() => ({ error: 'Failed to fetch status' }));
            console.error('[AuthProvider] Deploy API error:', errorData.error);
          }
        } catch (err) {
          console.error('[AuthProvider] Failed to check returning user status:', err);
          setPredictError('Connection failed');
        } finally {
          setIsCheckingAccount(false);
        }
      };
      checkReturningUser();
    }
  }, [isConnected, btcPubkeyHex, isAuthenticated]);

  return (
    <AuthContext.Provider
      value={{
        isConnected,
        setIsConnected,
        walletType,
        setWalletType,
        walletId,
        setWalletId,
        addresses,
        setAddresses,
        network,
        setNetwork,
        starknetAddress,
        setStarknetAddress,
        btcPubkeyHex,
        setBtcPubkeyHex,
        isAuthenticated,
        setIsAuthenticated,
        balance,
        setBalance,
        zkProof,
        setZkProof,
        predictError,
        setPredictError,
        isCheckingAccount,
        resetAll,
        connect,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthProvider;
