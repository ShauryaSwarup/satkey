import { PaymasterRpc } from "starknet";
import { StarkZap } from "starkzap";

const avnuApiKey = process.env.AVNU_PAYMASTER_SEPOLIA_KEY;
const rpcUrl = process.env.STARKNET_RPC_URL || 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/cCOvFD0gs7yy-YBEph_J5';

const paymaster = new PaymasterRpc({
  nodeUrl: 'https://sepolia.paymaster.avnu.fi',
  headers: { 'x-paymaster-api-key': avnuApiKey || '' },

});

export const sdk = new StarkZap({
  network: "sepolia",
  rpcUrl,
  paymaster,
},);