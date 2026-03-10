"use client";

import { useAuth } from "@/providers/AuthProvider";
import { getAtomiqSwapper, getAtomiqFactory } from "@/lib/atomiq";
import { SwapAmountType, PercentagePPM, SpvFromBTCSwap, ToBTCSwap } from "@atomiqlabs/sdk";
import Wallet, { AddressPurpose } from "sats-connect";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check, ExternalLink } from "lucide-react";
import Image from "next/image";
import { SatKeySigner } from "@/models/SatKeySigner";
import { Account, RpcProvider } from "starknet";
import { createClient } from "@/lib/supabase/client";
import { BridgeInput } from "./BridgeInput";
import { SwapHistory } from "./SwapHistory";
import { SwapProgress } from "./SwapProgress";
import { SwapDetails } from "./SwapDetails";
import { ActiveSwap } from "@/lib/supabase/types";

type Step = "input" | "quote" | "signing" | "confirming" | "success";
type View = "new" | "active";

const PROVER_URL = process.env.NEXT_PUBLIC_PROVER_URL || "http://localhost:3001";
const STARKNET_RPC_URL = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/cCOvFD0gs7yy-YBEph_J5";
 

enum SpvFromBTCSwapState {
  CLOSED = -5,
  FAILED = -4,
  DECLINED = -3,
  QUOTE_EXPIRED = -2,
  QUOTE_SOFT_EXPIRED = -1,
  CREATED = 0,
  SIGNED = 1,
  POSTED = 2,
  BROADCASTED = 3,
  FRONTED = 4,
  BTC_TX_CONFIRMED = 5,
  CLAIM_CLAIMED = 6
}

export function BridgeFlow() {
  const supabase = useMemo(() => createClient(), []);

  const [view, setView] = useState<View>("new");
  const [step, setStep] = useState<Step>("input");
  const [amount, setAmount] = useState<string>("");
  const [outputAmount, setOutputAmount] = useState<string>("");
  const [confirmations, setConfirmations] = useState(0);
  const { starknetAddress, addresses, btcPubkeyHex, authCredentials } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string>("");
  const [swap, setSwap] = useState<ToBTCSwap<any> | SpvFromBTCSwap<any> | null>(null);
  const [swapState, setSwapState] = useState<number | null>(null);
  const [quoteDetails, setQuoteDetails] = useState<{ input: string; fee: string; inputWithFees: string; output: string; expiry: number, swapPrice: number, marketPrice: number | undefined, difference: PercentagePPM } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [automaticSettlementFailed, setAutomaticSettlementFailed] = useState(false);
  const [activeSwaps, setActiveSwaps] = useState<ActiveSwap[]>([]);
  const [selectedSwap, setSelectedSwap] = useState<ActiveSwap | null>(null);
  const [isLoadingSwaps, setIsLoadingSwaps] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [btcBalance, setBtcBalance] = useState<string | null>(null);
  const [strkBalance, setStrkBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isReversed, setIsReversed] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);

  useEffect(() => {
    const fetchQuote = async () => {
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0 || !starknetAddress) {
        setOutputAmount("");
        setError(null);
        return;
      }

      setError(null);
      setIsFetchingQuote(true);
      try {
        const swapper = await getAtomiqSwapper();
        const factory = getAtomiqFactory();
        const Tokens = factory.Tokens;
        if (isReversed) {
          const addr = addresses.find(a => a.purpose === AddressPurpose.Payment)?.address;
          if (!addr) throw new Error("No payment address found for quote");
          const formattedStarknetAddress = starknetAddress?.startsWith('0x') ? starknetAddress : `0x${starknetAddress}`;
          const swapInstance = await swapper!.swap(
            Tokens.STARKNET.STRK,
            Tokens.BITCOIN.BTC,
            amount,
            SwapAmountType.EXACT_IN,
            formattedStarknetAddress,
            addr,
          );

          const output = swapInstance.getOutput().toString();
          setOutputAmount(output);
          setSwap(swapInstance);
          setSwapState(swapInstance.getState());
          setQuoteDetails({
            input: swapInstance.getInputWithoutFee().toString(),
            inputWithFees: swapInstance.getInput().toString(),
            fee: swapInstance.getFee().amountInSrcToken.toString(),
            output,
            expiry: swapInstance.getQuoteExpiry(),
            swapPrice: swapInstance.getPriceInfo().swapPrice,
            marketPrice: swapInstance.getPriceInfo().marketPrice,
            difference: swapInstance.getPriceInfo().difference
          });
          return;
        }
        const paymentAddressForSwap = addresses.find(a => a.purpose === AddressPurpose.Payment)?.address;
        const swapInstance = await swapper!.swap(
          Tokens.BITCOIN.BTC,
          Tokens.STARKNET.STRK,
          amount,
          SwapAmountType.EXACT_IN,
          paymentAddressForSwap,
          starknetAddress,
        );

        const output = swapInstance.getOutput().toString();
        setOutputAmount(output);
        setSwap(swapInstance);
        setSwapState(swapInstance.getState());
        setQuoteDetails({
          input: swapInstance.getInputWithoutFee().toString(),
          inputWithFees: swapInstance.getInput().toString(),
          fee: swapInstance.getFee().amountInSrcToken.toString(),
          output,
          expiry: swapInstance.getQuoteExpiry(),
          swapPrice: swapInstance.getPriceInfo().swapPrice,
          marketPrice: swapInstance.getPriceInfo().marketPrice,
          difference: swapInstance.getPriceInfo().difference
        });
      } catch (err) {
        console.error('Failed to fetch quote:', err);
        setOutputAmount("");
        setError(err instanceof Error ? err.message : "Failed to fetch quote");
      } finally {
        setIsFetchingQuote(false);
      }
    };

    const timeoutId = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeoutId);
  }, [amount, starknetAddress, isReversed, addresses]);

  useEffect(() => {
    const fetchActiveSwaps = async () => {
      if (!btcPubkeyHex || hasFetched) return;
      setIsLoadingSwaps(true);
      try {
        const { data } = await supabase
          .from('active_swaps')
          .select('*')
          .eq('btc_pubkey', btcPubkeyHex)
          .order('created_at', { ascending: false });
        if (data) setActiveSwaps(data);
        setHasFetched(true);
      } finally {
        setIsLoadingSwaps(false);
      }
    };
    fetchActiveSwaps();
  }, [btcPubkeyHex, hasFetched, supabase]);

  useEffect(() => {
    const fetchBtcBalance = async () => {
      if (!addresses.length || isReversed) return;
      setIsLoadingBalance(true);
      try {
        const swapper = await getAtomiqSwapper();
        const paymentAddress = addresses.find(a => a.purpose === AddressPurpose.Payment)?.address;
        if (!paymentAddress) return;
        const btcResult = await swapper!.Utils.getBitcoinSpendableBalance(paymentAddress, "STARKNET");
        const btcBal = btcResult?.balance?.amount ?? (btcResult as any)?.amount ?? null;
        setBtcBalance(btcBal ?? null);
      } catch (err) {
        console.error('Failed to fetch BTC balance:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };
    fetchBtcBalance();
  }, [addresses, isReversed]);

  useEffect(() => {
    const fetchStrkBalance = async () => {
      if (!starknetAddress || !authCredentials || !isReversed) return;
      setIsLoadingBalance(true);
      try {
        const swapper = await getAtomiqSwapper();
        const factory = getAtomiqFactory();
        const balance = await swapper!.Utils.getSpendableBalance(starknetAddress, factory.Tokens.STARKNET.STRK);
        setStrkBalance(balance.amount);
      } catch (err) {
        console.error('Failed to fetch STRK balance:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };
    fetchStrkBalance();
  }, [starknetAddress, authCredentials, isReversed]);

  const handleContinue = async () => {
    if (!swap) return;
    executeSwap();
  };

  const executeSwap = async () => {
    if (!swap) return;
    setError(null);
    setIsProcessing(true);
    setStep("signing");

    try {
      if (!btcPubkeyHex) {
        setError("Please connect your wallet");
        setIsProcessing(false);
        setStep("input");
        return;
      }

      const paymentAddress = addresses.find(a => a.purpose === AddressPurpose.Payment)?.address;
      if (!paymentAddress) throw new Error("No payment address found");

      if (isReversed) {
        const starknetAddressLocal = starknetAddress;
        if (!starknetAddressLocal || !authCredentials) {
          setError("No Starknet address or auth credentials found");
          setIsProcessing(false);
          setStep("input");
          return;
        }
        const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
        const nonceResult = await provider.callContract({
          contractAddress: starknetAddressLocal,
          entrypoint: 'get_nonce',
          calldata: []
        });
        const nonceDecimal = nonceResult[0] ? BigInt(nonceResult[0]).toString() : '0';
        const signer = new SatKeySigner({
          proverUrl: PROVER_URL,
          btcProofInputs: {
            pubkey: authCredentials.pubkey,
            signature_r: authCredentials.signature_r,
            signature_s: authCredentials.signature_s,
            message_hash: authCredentials.message_hash,
            expiry: authCredentials.expiry,
            salt: authCredentials.salt,
            nonce: nonceDecimal
          },
        });

        const account = new Account({
          provider,
          address: starknetAddressLocal,
          signer,
        });

        const commitTxs = await (swap as any).txsCommit();
        const BOOSTED_L2_GAS = 1_150_000_000n;
        
        for (const tx of commitTxs) {
          const rb = (tx as any).details?.resourceBounds;
          if (rb?.l2_gas) {
            const currentL2 = BigInt(rb.l2_gas.max_amount);
            if (currentL2 < BOOSTED_L2_GAS) {
              rb.l2_gas.max_amount = BOOSTED_L2_GAS;
            }
          }
        }

        let commitTxId: string | undefined;
        for (const tx of commitTxs) {
          const result = await account.execute((tx as any).tx, {
            resourceBounds: (tx as any).details?.resourceBounds,
          });
          commitTxId = result.transaction_hash;
        }

        if (commitTxId) {
          setTxId(commitTxId);
          setStep("confirming");
          if (btcPubkeyHex && quoteDetails) {
            await supabase.from('active_swaps').upsert({
              btc_pubkey: btcPubkeyHex,
              tx_id: commitTxId,
              amount,
              input_amount: quoteDetails.input,
              output_amount: quoteDetails.output,
              fee: quoteDetails.fee,
              starknet_address: starknetAddress,
              confirmations: 0,
              swap_state: SpvFromBTCSwapState.BROADCASTED,
              quote_expiry: quoteDetails.expiry,
              swap_type: "STRK_TO_BTC",
            });
          }
        }

        await (swap as any).waitTillCommited();
        const swapSuccessful = await (swap as any).waitForPayment();
        
        if (swapSuccessful) {
          setStep("success");
          if (btcPubkeyHex && commitTxId) {
            await supabase.from('active_swaps')
              .update({ swap_state: SpvFromBTCSwapState.CLAIM_CLAIMED })
              .eq('btc_pubkey', btcPubkeyHex)
              .eq('tx_id', commitTxId);
          }
        } else {
          setAutomaticSettlementFailed(true);
        }

      } else {
        const success = await (swap as SpvFromBTCSwap<any>).execute(
          {
            address: paymentAddress,
            publicKey: btcPubkeyHex,
            signPsbt: async (psbt: { psbtBase64: string }, signInputs: number[]) => {
              const response = await Wallet.request('signPsbt', {
                psbt: psbt.psbtBase64,
                broadcast: false,
                signInputs: { [paymentAddress]: signInputs }
              });
              if (response.status === 'success') return response.result.psbt;
              throw new Error("User rejected signing");
            }
          },
          {
            onSourceTransactionSent: async (txId: string) => {
              setTxId(txId);
              setStep("confirming");
              if (btcPubkeyHex && quoteDetails) {
                await supabase.from('active_swaps').upsert({
                  btc_pubkey: btcPubkeyHex,
                  tx_id: txId,
                  amount,
                  input_amount: quoteDetails.input,
                  output_amount: quoteDetails.output,
                  fee: quoteDetails.fee,
                  starknet_address: starknetAddress,
                  confirmations: 0,
                  swap_state: SpvFromBTCSwapState.BROADCASTED,
                  quote_expiry: quoteDetails.expiry,
                  swap_type: "BTC_TO_STRK"
                });
              }
            },
            onSourceTransactionConfirmationStatus: async (sourceTxId?: string, confirmations?: number) => {
              setConfirmations(confirmations || 0);
              if (btcPubkeyHex && confirmations !== undefined) {
                await supabase.from('active_swaps')
                  .update({ confirmations })
                  .eq('btc_pubkey', btcPubkeyHex)
                  .eq('tx_id', sourceTxId);
              }
            },
            onSwapSettled: async () => {
              setStep("success");
              if (btcPubkeyHex) {
                await supabase.from('active_swaps')
                  .update({ swap_state: SpvFromBTCSwapState.CLAIM_CLAIMED })
                  .eq('btc_pubkey', btcPubkeyHex)
                  .eq('tx_id', txId);
              }
            }
          }
        );

        if (!success) setAutomaticSettlementFailed(true);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Swap execution failed");
      setStep("input");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualClaim = async () => {
    if (!swap || !authCredentials) return;
    setError(null);
    setIsProcessing(true);

    try {
      if (!starknetAddress) throw new Error("No Starknet address found");
      const provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL });
      const nonceResult = await provider.callContract({
        contractAddress: starknetAddress,
        entrypoint: 'get_nonce',
        calldata: []
      });
      const nonceDecimal = nonceResult[0] ? BigInt(nonceResult[0]).toString() : '0';
      const signer = new SatKeySigner({
        proverUrl: PROVER_URL,
        btcProofInputs: {
          pubkey: authCredentials.pubkey,
          signature_r: authCredentials.signature_r,
          signature_s: authCredentials.signature_s,
          message_hash: authCredentials.message_hash,
          expiry: authCredentials.expiry,
          salt: authCredentials.salt,
          nonce: nonceDecimal
        }
      });

      if (!starknetAddress) throw new Error("No Starknet address found");
      const starknetAddressLocal = starknetAddress;
      if (!starknetAddressLocal) throw new Error("No Starknet address found");
      const account = new Account({
        provider,
        address: starknetAddressLocal,
        signer
      });
      await (swap as SpvFromBTCSwap<any>).claim(account);
      setStep("success");
    } catch (err: unknown) {
      console.error("Manual claim failed:", err);
      setError(err instanceof Error ? err.message : "Manual claim failed");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!swap) return;
    const onStateChange = async (s: any) => {
      const newState = s.getState();
      setSwapState(newState);
      // Only update the DB row for the specific transaction when we know txId.
      // Previously we updated by btc_pubkey only which accidentally updated all
      // swaps for that pubkey whenever any swap instance changed state.
      try {
        if (btcPubkeyHex && txId) {
          await supabase.from('active_swaps')
            .update({ swap_state: newState })
            .eq('btc_pubkey', btcPubkeyHex)
            .eq('tx_id', txId);
        } else {
          // txId not yet set: skip DB update to avoid clobbering other records.
          // The UI state (swapState) is still updated above for the active flow.
          // Once txId becomes available the code paths that set txId will persist
          // the proper swap_state into the DB (see onSourceTransactionSent / commit handler).
          console.warn('[BridgeFlow] txId not available; skipping swap_state DB update to avoid mass-updates');
        }
      } catch (err) {
        console.error('Failed to update swap_state in active_swaps:', err);
      }
    };
    swap.events.on("swapState", onStateChange);
    return () => { swap.events.off("swapState", onStateChange); };
  }, [swap, btcPubkeyHex, supabase]);

  const resetFlow = () => {
    setView("new");
    setStep("input");
    setAmount("");
    setConfirmations(0);
    setSwap(null);
    setSwapState(null);
    setAutomaticSettlementFailed(false);
    setError(null);
    setHasFetched(false);
    setSelectedSwap(null);
  };

  const handleSelectSwap = (activeSwap: ActiveSwap) => {
    setSelectedSwap(activeSwap);
    setView("active");
    setAmount(activeSwap.amount);
    setTxId(activeSwap.tx_id);
    setConfirmations(activeSwap.confirmations);
    setSwapState(activeSwap.swap_state);
    setStep("confirming");
  };

  return (
    <div className="flex flex-col items-center w-full h-[calc(100vh-6rem)] py-8 px-4 gap-6">
      {view === "active" && (
        <button
          onClick={resetFlow}
          className="mb-0 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors border border-white/10"
        >
          ← Back to Bridge
        </button>
      )}

      {/* Main content - Bridge Input and Transaction History side by side */}
      <div className="flex flex-col lg:flex-row justify-between items-start gap-6 w-full mt-20">
        <div className="w-full max-w-md relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/20 to-amber-500/20 rounded-3xl blur-xl opacity-50" />
          <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 overflow-hidden shadow-2xl">
            <AnimatePresence mode="wait">
              {step === "input" && (
                <BridgeInput
                  amount={amount}
                  setAmount={setAmount}
                  onContinue={handleContinue}
                  isProcessing={isProcessing}
                  error={error}
                  starknetAddress={starknetAddress}
                  balance={isReversed ? strkBalance : btcBalance}
                  isLoadingBalance={isLoadingBalance}
                  isReversed={isReversed}
                  setIsReversed={setIsReversed}
                  outputAmount={outputAmount}
                  setOutputAmount={setOutputAmount}
                  isFetchingQuote={isFetchingQuote}
                />
              )}

              {step === "signing" && (
                <motion.div
                  key="signing"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 mb-2">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Signing Transaction</h2>
                    <p className="text-white/60 text-sm">{isReversed ? "Your Starknet signature is being generated..." : "Confirm the swap in your wallet"}</p>
                  </div>
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-start gap-3">
                    <Loader2 className="w-5 h-5 text-orange-400 animate-spin flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-200/80">
                      {isReversed ? "Waiting for Starknet signature..." : "Waiting for Bitcoin signature..."}
                    </p>
                  </div>
                </motion.div>
              )}

              {step === "confirming" && (
                view === "active" ? (
                  selectedSwap ? (
                    <SwapDetails swap={selectedSwap} />
                  ) : (
                    <SwapProgress
                      confirmations={confirmations}
                      swapState={swapState}
                      txId={txId}
                      automaticSettlementFailed={automaticSettlementFailed}
                      isProcessing={isProcessing}
                      isReversed={isReversed}
                      onManualClaim={handleManualClaim}
                    />
                  )
                ) : (
                  <SwapProgress
                    confirmations={confirmations}
                    swapState={swapState}
                    txId={txId}
                    automaticSettlementFailed={automaticSettlementFailed}
                    isProcessing={isProcessing}
                    isReversed={isReversed}
                    onManualClaim={handleManualClaim}
                  />
                )
              )}

              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8 py-8 text-center"
                >
                  <div className="relative">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 12, stiffness: 100, delay: 0.1 }}
                      className="w-24 h-24 mx-auto bg-linear-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(52,211,153,0.4)]"
                    >
                      <Check className="w-12 h-12 text-white" />
                    </motion.div>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-3xl font-bold text-white">Bridged!</h2>
                    <p className="text-white/60">
                      {isReversed
                        ?  `Successfully swapped ${amount} STRK to Bitcoin Network.`
                        : `Successfully sent ${amount} BTC to Starknet Network.`}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 inline-flex items-center gap-3 mx-auto">
                    <div className="text-left">
                      <p className="text-xs text-white/40 uppercase tracking-wider">Transaction ID</p>
                      <p className="text-sm text-white font-mono">{txId.slice(0, 6)}...{txId.slice(-4)}</p>
                    </div>
                    <a
                      href={isReversed
                        ? `https://sepolia.voyager.online/tx/${txId}`
                        : `https://mempool.space/testnet4/tx/${txId}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  <button
                    onClick={resetFlow}
                    className="w-full py-4 rounded-xl bg-white/10 text-white font-bold text-lg hover:bg-white/20 transition-colors"
                  >
                    Bridge More
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="w-full lg:w-100 shrink-0">
          <div className="sticky top-24">
            <SwapHistory
              swaps={activeSwaps}
              isLoading={isLoadingSwaps}
              onSelectSwap={handleSelectSwap}
            />
          </div>
        </div>
      </div>

      {/* Powered by Atomiq */}
      <div className="flex items-center justify-center gap-2 mt-6 text-white/40">
        <span className="text-sm">Powered by</span>
        <div className="relative w-20 h-5">
          <Image
            src="/atomiq.svg"
            alt="Atomiq"
            fill
            className="object-contain"
          />
        </div>
      </div>
    </div>
  );
}
