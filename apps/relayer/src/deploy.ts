import { RpcProvider, Account, hash as starkHash, num, CallData } from "starknet";

const DOMAIN_TAG = BigInt("0x5341544b4559");
const STARK_FIELD_PRIME = BigInt(
  "0x0800000000000011000000000000000000000000000000000000000000000001"
);

const UDC_ADDRESS =
  "0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf";

export interface DeployRequest {
  proof: string;
  publicSignals: string[];
  pubkey: string;
}

export interface DeployResult {
  accountAddress: string;
  transactionHash: string;
  alreadyDeployed: boolean;
}


function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function decompressPubkey(pubkeyHex: string): { x: bigint; y: bigint } {
  const clean = pubkeyHex.startsWith("0x") ? pubkeyHex.slice(2) : pubkeyHex;

  if (clean.length === 130 && clean.startsWith("04")) {
    return {
      x: BigInt("0x" + clean.slice(2, 66)),
      y: BigInt("0x" + clean.slice(66, 130)),
    };
  }

  if (clean.length !== 66) {
    throw new Error(
      `Invalid pubkey hex length ${clean.length}. Expected 66 (compressed) or 130 (uncompressed).`
    );
  }

  const prefix = clean.slice(0, 2);
  if (prefix !== "02" && prefix !== "03") {
    throw new Error(`Invalid compressed pubkey prefix: ${prefix}`);
  }

  const P =
    0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const x = BigInt("0x" + clean.slice(2));
  const y2 = (x ** 3n + 7n) % P;
  let y = modPow(y2, (P + 1n) / 4n, P);
  const isOdd = prefix === "03";
  if ((y & 1n) !== (isOdd ? 1n : 0n)) {
    y = P - y;
  }

  return { x, y };
}

export function deriveStarknetSalt(pubkeyHex: string): bigint {
  const { x, y } = decompressPubkey(pubkeyHex);

  const xFelt = x % STARK_FIELD_PRIME;
  const yFelt = y % STARK_FIELD_PRIME;
  const domainFelt = DOMAIN_TAG % STARK_FIELD_PRIME;

  // Use starknet.js Poseidon which operates on the Stark field
  // (NOT circomlibjs which uses BN254 field)
  const salt = BigInt(starkHash.computePoseidonHashOnElements([
    num.toHex(xFelt),
    num.toHex(yFelt),
    num.toHex(domainFelt),
  ]));

  return salt;
}

export async function deployAccount(
  req: DeployRequest
): Promise<DeployResult> {
  const rpcUrl = process.env.STARKNET_RPC_URL || "http://localhost:5050";
  const relayerAddress = process.env.RELAYER_ADDRESS;
  const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
  const classHash = process.env.SATKEY_CLASS_HASH || "0x0";
  const verifierAddress = process.env.VERIFIER_ADDRESS || "0x0";

  if (!relayerAddress || !relayerPrivateKey) {
    throw new Error(
      "Missing RELAYER_ADDRESS or RELAYER_PRIVATE_KEY in environment"
    );
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const relayerAccount = new Account(provider, relayerAddress, relayerPrivateKey);

  const salt = deriveStarknetSalt(req.pubkey);
  const constructorCalldata = [verifierAddress, num.toHex(salt)];
  const expectedAddress = starkHash.calculateContractAddressFromHash(
    num.toHex(salt),
    classHash,
    constructorCalldata,
    0
  );

  try {
    await provider.getClassHashAt(num.toHex(expectedAddress));
    return {
      accountAddress: num.toHex(expectedAddress),
      transactionHash: "0x0",
      alreadyDeployed: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.toLowerCase().includes("contract not found")) {
      throw err;
    }
  }

  const deployTx = await relayerAccount.execute([
    {
      contractAddress: UDC_ADDRESS,
      entrypoint: "deployContract",
      calldata: CallData.compile({
        classHash,
        salt: num.toHex(salt),
        unique: 0,
        calldata: constructorCalldata,
      }),
    },
  ]);

  await provider.waitForTransaction(deployTx.transaction_hash);

  return {
    accountAddress: num.toHex(expectedAddress),
    transactionHash: deployTx.transaction_hash,
    alreadyDeployed: false,
  };
}
