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

export interface AuthCredentials {
  pubkey: string;
  signature_r: string;
  signature_s: string;
  message_hash: string;
  expiry: string;
  salt: string;
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
  authCredentials: AuthCredentials | null;
  setAuthCredentials: (val: AuthCredentials | null) => void;
  resetAll: () => Promise<void>;
  connect: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Avoid reading sessionStorage during render to prevent SSR/CSR mismatch.
  // Initialize to stable defaults and hydrate on the client in useEffect.
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
  const [authCredentials, setAuthCredentials] = useState<AuthCredentials | null>(null);
  // Flag to indicate we've hydrated values from sessionStorage onto state
  const [storageHydrated, setStorageHydrated] = useState<boolean>(false);

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
    if (typeof window !== 'undefined') sessionStorage.clear();
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
    setAuthCredentials(null);
  };

  // Predict Account Address for Returning Users
  // IMPORTANT: This does NOT authenticate. It only predicts the address so the UI can show it.
  // ZkAuthFlow must always run to generate fresh credentials, even for returning users.
  useEffect(() => {
    // Only run after we've hydrated session storage
    if (!storageHydrated) return;

    if (isConnected && btcPubkeyHex && !isAuthenticated) {
      const predictAddress = async () => {
        setIsCheckingAccount(true);
        try {
          // Calculate address locally using our starknet utils
          const { deriveExpectedAccountAddress, deriveStarknetSalt } = await import('@/lib/starknet');
          const salt = await deriveStarknetSalt(btcPubkeyHex);
          const classHash = process.env.NEXT_PUBLIC_SATKEY_CLASS_HASH || "0x0";
          const verifierClassHash = process.env.NEXT_PUBLIC_VERIFIER_CLASS_HASH || "0x0";

          if (classHash === "0x0" || verifierClassHash === "0x0") {
            setPredictError("Frontend not configured with class hash");
            setIsCheckingAccount(false);
            return;
          }

          const accountAddress = deriveExpectedAccountAddress(
            salt,
            classHash,
            [verifierClassHash, "0x" + salt.toString(16)]
          );
          setPredictError(null);
          setStarknetAddress(accountAddress);
        } catch (err) {
          console.error('[AuthProvider] Failed to predict account address:', err);
          setPredictError('Connection failed');
        } finally {
          setIsCheckingAccount(false);
          // NOTE: We do NOT set isAuthenticated here.
          // ZkAuthFlow must run to generate fresh credentials for bridging.
        }
      };
      predictAddress();
    }
  }, [isConnected, btcPubkeyHex, isAuthenticated, storageHydrated]);

  // Hydrate from sessionStorage on first client render
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storedIsConnected = sessionStorage.getItem('satkey_isConnected');
      const storedAddresses = sessionStorage.getItem('satkey_addresses');
      const storedStarknetAddress = sessionStorage.getItem('satkey_starknetAddress');
      const storedBtcPubkeyHex = sessionStorage.getItem('satkey_btcPubkeyHex');
      const storedIsAuthenticated = sessionStorage.getItem('satkey_isAuthenticated');
      const storedAuthCredentials = sessionStorage.getItem('satkey_authCredentials');

      if (storedIsConnected !== null) setIsConnected(storedIsConnected === 'true');
      if (storedAddresses) {
        try {
          setAddresses(JSON.parse(storedAddresses));
        } catch (e) {
          console.warn('[AuthProvider] Failed to parse stored addresses', e);
        }
      }
      if (storedStarknetAddress) setStarknetAddress(storedStarknetAddress || null);
      if (storedBtcPubkeyHex) setBtcPubkeyHex(storedBtcPubkeyHex || null);
      if (storedIsAuthenticated !== null) setIsAuthenticated(storedIsAuthenticated === 'true');
      if (storedAuthCredentials) {
        try {
          setAuthCredentials(JSON.parse(storedAuthCredentials));
        } catch (e) {
          console.warn('[AuthProvider] Failed to parse stored auth credentials', e);
        }
      }
    } catch (err) {
      console.error('[AuthProvider] Error hydrating from sessionStorage', err);
    } finally {
      setStorageHydrated(true);
    }
  }, []);

  // Persist relevant values to sessionStorage whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem('satkey_isConnected', String(isConnected));
      sessionStorage.setItem('satkey_addresses', JSON.stringify(addresses));
      sessionStorage.setItem('satkey_starknetAddress', starknetAddress || '');
      sessionStorage.setItem('satkey_btcPubkeyHex', btcPubkeyHex || '');
      sessionStorage.setItem('satkey_isAuthenticated', String(isAuthenticated));
      sessionStorage.setItem('satkey_authCredentials', JSON.stringify(authCredentials));
    } catch (err) {
      console.error('[AuthProvider] Error persisting to sessionStorage', err);
    }
  }, [isConnected, addresses, starknetAddress, btcPubkeyHex, isAuthenticated, authCredentials]);

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
        authCredentials,
        setAuthCredentials,
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
