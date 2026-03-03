"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface Address {
  address: string;
  publicKey: string;
  purpose: string;
  addressType: string;
  network: string;
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

  // Fast-Path Login for Returning Users
  useEffect(() => {
    // Uses same-origin API routes now (AVNU paymaster integration)
    // PredictAddress logic is handled client-side via deriveStarknetSalt
    // For returning users, we check deployment status via /api/deploy

    if (isConnected && btcPubkeyHex && !isAuthenticated) {
      const checkReturningUser = async () => {
        try {
          // Calculate address locally using our starknet utils
          const { deriveExpectedAccountAddress, deriveStarknetSalt } = await import('@/lib/starknet');
          const salt = deriveStarknetSalt(btcPubkeyHex);
          const classHash = process.env.NEXT_PUBLIC_SATKEY_CLASS_HASH || "0x0";
          const verifierAddress = process.env.NEXT_PUBLIC_VERIFIER_ADDRESS || "0x0";

          if (classHash === "0x0" || verifierAddress === "0x0") {
            setPredictError("Frontend not configured with class hash");
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
            // Don't fail hard - user can still try to deploy
          }
        } catch (err) {
          console.error('[AuthProvider] Failed to check returning user status:', err);
          setPredictError('Connection failed');
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
