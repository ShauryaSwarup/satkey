const fs = require('fs');

let content = fs.readFileSync('apps/frontend/models/SatKeySigner.ts', 'utf8');

// Update ProofInputs interface
content = content.replace(
  /export interface ProofInputs \{[\s\S]*?\}/,
  `export interface ProofInputs {\n  pubkey: string;\n  address: string;\n  message: string;\n  signature: string;\n  expiry: string;\n  salt: string;\n  nonce?: string;\n}`
);

// Update fetch to include address, message, signature
content = content.replace(
  /body: JSON\.stringify\(\{\n\s*pubkey: this\.btcProofInputs\.pubkey,\n\s*secret: this\.btcProofInputs\.secret,\n\s*pubkey_commitment: this\.btcProofInputs\.pubkey_commitment,/g,
  `body: JSON.stringify({\n        pubkey: this.btcProofInputs.pubkey,\n        address: this.btcProofInputs.address,\n        message: this.btcProofInputs.message,\n        signature: this.btcProofInputs.signature,`
);

fs.writeFileSync('apps/frontend/models/SatKeySigner.ts', content);
