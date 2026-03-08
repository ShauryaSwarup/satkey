import { StarkZap } from "starkzap";

const avnuApiKey = process.env.AVNU_PAYMASTER_SEPOLIA_KEY;

export const sdk = new StarkZap({
  network: "sepolia",
  paymaster: {
    nodeUrl: 'https://sepolia.paymaster.avnu.fi',
    headers: { 'x-paymaster-api-key': avnuApiKey || '' },
  }
});
