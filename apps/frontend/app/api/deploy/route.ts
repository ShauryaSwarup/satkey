import { NextRequest, NextResponse } from 'next/server';
import { num, RpcProvider, hash as starkHash } from 'starknet';
import { StarkSigner } from 'starkzap';
import { sdk } from '@/lib/starkzap';

const UDC_ADDRESS = '0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf';

export interface DeployRequest {
  pubkey: string;
  fullProof?: string[];
  publicSignals?: string[];
}

export interface DeployResponse {
  accountAddress: string;
  transactionHash: string;
  alreadyDeployed: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: DeployRequest = await request.json();
    const { pubkey, fullProof, publicSignals } = body;

    if (!pubkey) {
      return NextResponse.json(
        { error: 'Missing required field: pubkey' },
        { status: 400 }
      );
    }

    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const classHash = process.env.NEXT_PUBLIC_SATKEY_CLASS_HASH;
    const verifierClassHash = process.env.NEXT_PUBLIC_VERIFIER_CLASS_HASH;

    if (!deployerPrivateKey || !classHash || !verifierClassHash) {
      return NextResponse.json(
        { error: 'Server configuration missing. Check environment variables.' },
        { status: 500 }
      );
    }

    // Derive salt — trust circuit output if available
    let salt: bigint;
    if (publicSignals && publicSignals.length >= 1) {
      const STARK_FIELD_PRIME = BigInt(
        '0x0800000000000011000000000000000000000000000000000000000000000001'
      );
      salt = BigInt(publicSignals[0]) % STARK_FIELD_PRIME;
    } else {
      const { deriveStarknetSalt } = await import('@/lib/starknet');
      salt = await deriveStarknetSalt(pubkey);
    }

    const constructorCalldata = [verifierClassHash, num.toHex(salt)];
    const expectedAddress = starkHash.calculateContractAddressFromHash(
      num.toHex(salt),
      classHash,
      constructorCalldata,
      0
    );
    const accountAddress = num.toHex(expectedAddress);

    const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL! });
    let alreadyDeployed = false;
    try {
      // 1. Check if already deployed by querying class hash at address
      await provider.getClassHashAt(accountAddress);
      alreadyDeployed = true;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Contract not found')) {
        alreadyDeployed = false;
      } else {
        throw err;
      }
    }
    if (alreadyDeployed) {
      return NextResponse.json({
        accountAddress,
        transactionHash: '0x0',
        alreadyDeployed: true,
      } as DeployResponse);
    }
    // Connect deployer wallet via StarkZap
    const signer = new StarkSigner(deployerPrivateKey);
    const deployerWallet = await sdk.connectWallet({
      account: { signer },
    });

    // 2. No proof → return address for UI gating only, do not deploy
    if (!fullProof || !publicSignals) {
      return NextResponse.json({
        accountAddress,
        transactionHash: '0x0',
        alreadyDeployed: false,
      } as DeployResponse);
    }

    // 3. Deploy via UDC with sponsored fees
    const deployCalldata = [
      classHash,
      num.toHex(salt),
      '0x0', // unique = false
      num.toHex(constructorCalldata.length),
      ...constructorCalldata,
    ];

    const tx = await deployerWallet.execute(
      [
        {
          contractAddress: UDC_ADDRESS,
          entrypoint: 'deployContract',
          calldata: deployCalldata,
        },
      ],
      { feeMode: 'sponsored' }
    );

    await tx.wait();

    return NextResponse.json({
      accountAddress,
      transactionHash: tx.hash,
      alreadyDeployed: false,
    } as DeployResponse);
  } catch (error) {
    console.error('[deploy] Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Deployment failed: ${message}` },
      { status: 500 }
    );
  }
}