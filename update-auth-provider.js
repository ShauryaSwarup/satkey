const fs = require('fs');

let content = fs.readFileSync('apps/frontend/providers/AuthProvider.tsx', 'utf8');

// Update AuthCredentials
content = content.replace(
  /export interface AuthCredentials \{[\s\S]*?\}/,
  `export interface AuthCredentials {\n  pubkey: string;\n  salt: string;\n  expiry: string;\n  nonce: string;\n}`
);

// Update account address derivation (remove pubkey_commitment)
content = content.replace(
  /\[verifierClassHash, "0x" \+ salt\.toString\(16\), authCredentials\.pubkey_commitment\]/,
  `[verifierClassHash, "0x" + salt.toString(16)]`
);

fs.writeFileSync('apps/frontend/providers/AuthProvider.tsx', content);
