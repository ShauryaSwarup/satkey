"use client";

import { createContext, useContext, useState, ReactNode } from "react";

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
