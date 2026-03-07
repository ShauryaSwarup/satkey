/**
 * Relay Transaction API Route
 * 
 * Executes a transaction on behalf of a SatKey account using AVNU paymaster.
 * The deployer account signs transactions (AVNU sponsors the gas).
 */

import { NextRequest, NextResponse } from 'next/server';
import { RpcProvider, Account, num, PaymasterRpc, PaymasterDetails } from 'starknet';

export interface RelayRequest {
  fullProof: string[];
  publicSignals: string[];
  starknetAddress: string;
  calls?: Array<{
    to: string;
    selector: string;
    calldata: string[];
  }>;
}

export interface RelayResponse {
  transactionHash: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RelayRequest = await request.json();
    const { fullProof, publicSignals, starknetAddress, calls } = body;

    if (!fullProof || !publicSignals || !starknetAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: fullProof, publicSignals, starknetAddress' },
        { status: 400 }
      );
    }

    const rpcUrl = process.env.STARKNET_RPC_URL;
    const deployerAddress = process.env.DEPLOYER_ADDRESS;
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const avnuApiKey = process.env.AVNU_PAYMASTER_API_KEY;

    if (!rpcUrl || !deployerAddress || !deployerPrivateKey) {
      return NextResponse.json(
        { error: 'Server configuration missing. Check STARKNET_RPC_URL, DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY.' },
        { status: 500 }
      );
    }

    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    
    const paymaster = new PaymasterRpc({
      nodeUrl: 'https://sepolia.paymaster.avnu.fi',
      headers: { 'x-paymaster-api-key': avnuApiKey || '' },
    });

    const deployerAccount = new Account({
      provider,
      address: deployerAddress,
      signer: deployerPrivateKey,
      paymaster,
      cairoVersion: '1',
    });

    const signature = [
      ...fullProof,
    ];
    const txCalls = calls && calls.length > 0 
      ? calls.map(call => ({
          contractAddress: call.to,
          entrypoint: call.selector,
          calldata: call.calldata,
        }))
      : [];

    const serializedCalls: string[] = [];
    for (const call of txCalls) {
      serializedCalls.push(call.contractAddress);
      serializedCalls.push(call.entrypoint);         
      serializedCalls.push(num.toHex(call.calldata.length)); 
      serializedCalls.push(...call.calldata);           
    }

    const executeCalldata = [
      num.toHex(txCalls.length), 
      ...serializedCalls,          
      num.toHex(signature.length), 
      ...signature,                
    ];

    const feesDetails: PaymasterDetails = {
      feeMode: { mode: 'sponsored' },
    };
    const myCall = {
      contractAddress: starknetAddress,
      entrypoint: 'execute_from_relayer',
      calldata: executeCalldata,
    };
    const feeEstimation = await deployerAccount.estimatePaymasterTransactionFee([myCall], feesDetails);
    const result = await deployerAccount.executePaymasterTransaction(
      [myCall],
      feesDetails,
      feeEstimation.suggested_max_fee_in_gas_token
    );

    await provider.waitForTransaction(result.transaction_hash);

    return NextResponse.json({
      transactionHash: result.transaction_hash,
    } as RelayResponse);
  } catch (error) {
    console.error('[relay] Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Relay failed: ${message}` },
      { status: 500 }
    );
  }
}
