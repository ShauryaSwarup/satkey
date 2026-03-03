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

    // Get environment variables
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

    // Set up provider
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    
    // Set up AVNU paymaster
    const paymaster = new PaymasterRpc({
      nodeUrl: 'https://sepolia.paymaster.avnu.fi',
      headers: { 'x-paymaster-api-key': avnuApiKey || '' },
    });

    // Create deployer account WITH paymaster in constructor (signer + AVNU pays gas)
    const deployerAccount = new Account({
      provider,
      address: deployerAddress,
      signer: deployerPrivateKey,
      paymaster,
      cairoVersion: '1',
    });

    // Build the signature matching SatKey account expectation
    // Format: [proof_len, ...proof_felts, ...publicSignals]
    const signature = [
      num.toHex(fullProof.length),
      ...fullProof,
      ...publicSignals,
    ];

    // Build the calls array
    // For MVP, if no calls provided, we just authenticate (increment nonce)
    const txCalls = calls && calls.length > 0 
      ? calls.map(call => ({
          contractAddress: call.to,
          entrypoint: call.selector,
          calldata: call.calldata,
        }))
      : [];

    // Serialize the calls array: Cairo Array<Call> format
    // Each Call: [to (felt), selector (felt), calldata_len (felt), ...calldata]
    const serializedCalls: string[] = [];
    for (const call of txCalls) {
      serializedCalls.push(call.contractAddress); // to
      serializedCalls.push(call.entrypoint);         // selector
      serializedCalls.push(num.toHex(call.calldata.length)); // calldata_len
      serializedCalls.push(...call.calldata);           // calldata elements
    }

    // Calldata for execute_from_relayer(calls: Array<Call>, signature: Span<felt252>)
    const executeCalldata = [
      num.toHex(txCalls.length), // calls_len
      ...serializedCalls,          // serialized Call objects
      num.toHex(signature.length), // signature_len
      ...signature,                // signature elements
    ];

    // Execute with AVNU sponsored paymaster
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
