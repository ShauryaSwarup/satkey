import { StarkZap } from "starkzap";

const avnuApiKey = process.env.AVNU_PAYMASTER_API_KEY;

export const sdk = new StarkZap({
  network: "mainnet",
  paymaster: {
    nodeUrl: "https://sepolia.paymaster.avnu.fi",
    headers: { 'x-paymaster-api-key': avnuApiKey || '' },
  },
});