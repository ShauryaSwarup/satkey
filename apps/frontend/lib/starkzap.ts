import { StarkZap } from "starkzap";

const avnuApiKey = "cc98d665-ba65-4483-8f1f-4b4d25a750ce";

export const sdk = new StarkZap({
  network: "sepolia",
  paymaster: {
    nodeUrl: 'https://sepolia.paymaster.avnu.fi',
    headers: { 'x-paymaster-api-key': avnuApiKey || '' },
  }
});