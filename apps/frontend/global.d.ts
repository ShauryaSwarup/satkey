// Minimal local typings to satisfy TypeScript for third-party SDKs we don't ship types for.
// These mirror only the runtime surface the frontend uses. Keep them narrow and explicit.

declare module '@atomiqlabs/chain-starknet' {
  export const StarknetInitializer: unknown;
  export type StarknetInitializerType = unknown;
}

declare module '@atomiqlabs/sdk' {
  export enum BitcoinNetwork {
    TESTNET4 = "TESTNET4",
    MAINNET = "MAINNET",
  }

  export type TokenDescriptor = { code: string; name?: string };

  export const Tokens: {
    BITCOIN: { BTC: TokenDescriptor; BTCLN?: TokenDescriptor };
    STARKNET?: { STRK: TokenDescriptor };
  };

  // Runtime enum-like value used by the UI
  export const SwapAmountType: { EXACT_IN: string; EXACT_OUT: string };

  // These types are used by the frontend code. Keep them permissive so the UI can interact
  // with runtime swap objects returned by the SDK.
  export type SpvFromBTCSwap<T = any> = SwapInstance & { TYPE?: string } & Record<string, any>;
  export type ToBTCSwap<T = any> = SwapInstance & { TYPE?: string } & Record<string, any>;

  export class SwapperFactory<T = any> {
    constructor(initializers?: any[]);
    Tokens?: any;
    newSwapperInitialized(opts: any): Promise<TypedSwapper>;
  }

  export type SwapAmountType = {
    EXACT_IN: string;
    EXACT_OUT: string;
  };

  export type PercentagePPM = number;

  export type PriceInfo = { swapPrice: number; marketPrice?: number; difference: PercentagePPM };

  // Minimal swap instance shape used by the UI
  export type SwapInstance = {
    getOutput: () => { toString(): string } | string;
    getState: () => number;
    getInputWithoutFee: () => { toString(): string };
    getInput: () => { toString(): string };
    getFee: () => { amountInSrcToken: { toString(): string } };
    getQuoteExpiry: () => number;
    getPriceInfo: () => PriceInfo;
  };

  export class TypedSwapper<T = any> {
    swap(...args: any[]): Promise<SwapInstance>;
    // Some SDK methods return a top-level feeRate, others return it nested under `balance`.
    Utils: {
      // Some SDK endpoints return feeRate at the top-level, others nest it under `balance`.
      // We reflect both shapes so the UI can destructure either form safely.
      getBitcoinSpendableBalance(address: string, forChain?: string): Promise<{ feeRate?: number; balance?: { amount: string; feeRate?: number } }>;
      getSpendableBalance(address: string, token: any): Promise<{ amount: string; feeRate?: number } >;
    };
    Tokens?: any;
  }

  export { SwapperFactory as default };
}

declare module 'starkzap' {
  export type StarkZapOptions = { network?: string; paymaster?: { nodeUrl: string; headers?: Record<string, string> } };
  export class StarkZap {
    constructor(opts?: StarkZapOptions);
  }
  export default StarkZap;
}
