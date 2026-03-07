/**
 * Deploy Account API Route
 * 
 * Deploys a SatKey account using the Universal Deployer Contract (UDC).
 * Uses AVNU paymaster for gas-free transactions (you sponsor, user pays nothing).
 */
import { NextRequest, NextResponse } from 'next/server';
import { RpcProvider, Account, num, hash as starkHash, PaymasterRpc, PaymasterDetails } from 'starknet';
import { deriveStarknetSalt } from '@/lib/starknet';

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

    // Get environment variables
    const rpcUrl = process.env.STARKNET_RPC_URL;
    const deployerAddress = process.env.DEPLOYER_ADDRESS;
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const classHash = process.env.NEXT_PUBLIC_SATKEY_CLASS_HASH;
    const verifierClassHash = process.env.NEXT_PUBLIC_VERIFIER_CLASS_HASH;
    const avnuApiKey = process.env.AVNU_PAYMASTER_API_KEY;

    if (!rpcUrl || !deployerAddress || !deployerPrivateKey || !classHash || !verifierClassHash) {
      return NextResponse.json(
        { error: 'Server configuration missing. Check environment variables.' },
        { status: 500 }
      );
    }

    // Set up provider
    const provider = new RpcProvider({ nodeUrl: rpcUrl });

    // Calculate the expected address
    const salt = await deriveStarknetSalt(pubkey);
    const constructorCalldata = [verifierClassHash, num.toHex(salt)];
    const expectedAddress = starkHash.calculateContractAddressFromHash(
      num.toHex(salt),
      classHash,
      constructorCalldata,
      0
    );
    const accountAddress = num.toHex(expectedAddress);

    // 1. Check if already deployed
    try {
      await provider.getClassHashAt(accountAddress);
      return NextResponse.json({
        accountAddress,
        transactionHash: '0x0',
        alreadyDeployed: true,
      } as DeployResponse);
    } catch {
      // Not deployed, continue to gating check
    }

    // 2. Gating Check: If no proof provided, do NOT deploy.
    // Just return the status so the frontend can trigger the ZK flow.
    if (!fullProof || !publicSignals) {
      return NextResponse.json({
        accountAddress,
        transactionHash: '0x0',
        alreadyDeployed: false,
      } as DeployResponse);
    }

    // 3. Deployment Flow (Authorized by ZKP)
    // Set up AVNU paymaster
    const paymaster = new PaymasterRpc({
      nodeUrl: 'https://sepolia.paymaster.avnu.fi',
      headers: { 'x-paymaster-api-key': avnuApiKey || '' },
    });

    // Create deployer account WITH paymaster in constructor
    const deployerAccount = new Account({
      provider,
      address: deployerAddress,
      signer: deployerPrivateKey,
      cairoVersion: '1',
      paymaster,
    });

    // Build UDC deployment call
    const deployCalldata = [
      classHash,
      num.toHex(salt),
      '0x0', // unique = false
      num.toHex(constructorCalldata.length),
      ...constructorCalldata,
    ];

    // Execute with AVNU sponsored paymaster
    const feesDetails: PaymasterDetails = {
      feeMode: { mode: 'sponsored' },
    };

    const result = await deployerAccount.executePaymasterTransaction(
      [
        {
          contractAddress: UDC_ADDRESS,
          entrypoint: 'deployContract',
          calldata: deployCalldata,
        },
      ],
      feesDetails
    );

    await provider.waitForTransaction(result.transaction_hash);

    return NextResponse.json({
      accountAddress,
      transactionHash: result.transaction_hash,
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
