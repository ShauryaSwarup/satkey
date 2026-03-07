import { SwapperFactory, BitcoinNetwork, TypedSwapper } from "@atomiqlabs/sdk";
import { StarknetInitializer, StarknetInitializerType } from "@atomiqlabs/chain-starknet";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let factoryInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let swapperPromise: Promise<TypedSwapper<[StarknetInitializerType]>> | null = null;
const starknetRpcUrl: string = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/cCOvFD0gs7yy-YBEph_J5";

export function getAtomiqFactory() {
  if (!factoryInstance) {
    factoryInstance = new SwapperFactory<[StarknetInitializerType]>([StarknetInitializer]);
  }
  return factoryInstance as SwapperFactory<[typeof StarknetInitializer]>;
}

export function getAtomiqSwapper(): Promise<TypedSwapper<[StarknetInitializerType]>> | null {
  if (!swapperPromise) {
    const factory = getAtomiqFactory();
    swapperPromise = factory.newSwapperInitialized({
      bitcoinNetwork: BitcoinNetwork.TESTNET4,
      chains: {
        STARKNET: {
          rpcUrl: starknetRpcUrl,
        },
      }
    });
  }
  return swapperPromise;
}
