const fs = require('fs');
let content = fs.readFileSync('apps/frontend/app/api/deploy/route.ts', 'utf8');

content = content.replace(
  /pubkey_commitment: string;\n/g,
  ''
);

content = content.replace(
  /const { pubkey, salt, pubkey_commitment, fullProof, publicSignals } = body;/,
  'const { pubkey, salt, fullProof, publicSignals } = body;'
);

content = content.replace(
  /if \(!pubkey \|\| !salt \|\| !pubkey_commitment\) \{/,
  'if (!pubkey || !salt) {'
);

content = content.replace(
  /\{ error: 'Missing required field: pubkey, salt, or pubkey_commitment' \},/,
  `{ error: 'Missing required field: pubkey or salt' },`
);

content = content.replace(
  /const constructorCalldata = \[verifierClassHash, num\.toHex\(salt\), num\.toHex\(pubkey_commitment\)\];/,
  `const constructorCalldata = [verifierClassHash, num.toHex(salt)];`
);

fs.writeFileSync('apps/frontend/app/api/deploy/route.ts', content);
