const fs = require('fs');

let content = fs.readFileSync('apps/frontend/providers/AuthProvider.tsx', 'utf8');
content = content.replace(
  /export interface AuthCredentials \{\n  pubkey: string;\n  salt: string;\n  expiry: string;\n  nonce: string;\n\}/,
  `export interface AuthCredentials {\n  pubkey: string;\n  address: string;\n  message: string;\n  signature: string;\n  salt: string;\n  expiry: string;\n  nonce: string;\n}`
);
fs.writeFileSync('apps/frontend/providers/AuthProvider.tsx', content);

let zflow = fs.readFileSync('apps/frontend/components/Auth/ZkAuthFlow.tsx', 'utf8');
zflow = zflow.replace(
  /setAuthCredentials\(\{[\s\S]*?nonce,\n\s*\}\);/,
  `setAuthCredentials({
        pubkey: pubkeyHex,
        address: addressToSign,
        message,
        signature,
        salt,
        expiry,
        nonce,
      });`
);
fs.writeFileSync('apps/frontend/components/Auth/ZkAuthFlow.tsx', zflow);

let bflow = fs.readFileSync('apps/frontend/components/Bridge/BridgeFlow.tsx', 'utf8');
bflow = bflow.replace(
  /btcProofInputs: \{\n\s*pubkey: authCredentials\.pubkey,\n\s*secret: authCredentials\.secret,\n\s*pubkey_commitment: authCredentials\.pubkey_commitment,\n\s*expiry: authCredentials\.expiry,\n\s*salt: authCredentials\.salt,\n\s*\}/g,
  `btcProofInputs: {
          pubkey: authCredentials.pubkey,
          address: authCredentials.address,
          message: authCredentials.message,
          signature: authCredentials.signature,
          expiry: authCredentials.expiry,
          salt: authCredentials.salt,
          nonce: authCredentials.nonce,
        }`
);
fs.writeFileSync('apps/frontend/components/Bridge/BridgeFlow.tsx', bflow);

