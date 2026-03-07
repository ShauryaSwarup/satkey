const fs = require('fs');
let content = fs.readFileSync('apps/frontend/components/Auth/ZkAuthFlow.tsx', 'utf8');

// Replace everything between `const expiry = ...` and `const proofData = ...`
const replaceSrc1 = content.match(/const expiry = \(Date\.now\(\) \+ 5 \* 60 \* 1000\)\.toString\(\);[\s\S]*?const proofData = await proveResponse\.json\(\);/m)[0];

const replaceDest1 = `const expiry = Math.floor(Date.now() / 1000 + 5 * 60).toString(); // Unix timestamp in seconds
      const message = \`login:\${nonce}:\${expiry}\`;

      const signResponse = await Wallet.request("signMessage", {
        address: addressToSign,
        message,
        protocol: MessageSigningProtocols.ECDSA,
      });

      if (signResponse.status !== "success") {
        throw new Error(signResponse.error?.message || "Failed to sign message");
      }

      const signature = signResponse.result.signature;

      setStep("proving");

      const proveResponse = await fetch(\`\${PROVER_URL}/prove\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: pubkeyHex,
          address: addressToSign,
          message,
          signature,
          nonce,
          expiry,
        }),
      });

      if (!proveResponse.ok) {
        throw new Error(\`Prover error: \${await proveResponse.text()}\`);
      }

      const proofData = await proveResponse.json();
      const salt = proofData.salt;`;

content = content.replace(replaceSrc1, replaceDest1);

// Now replace the deployResponse body
const replaceSrc2 = `body: JSON.stringify({
          fullProof: proofData.fullProof,
          publicSignals: proofData.publicSignals,
          pubkey: pubkeyHex,
          salt,
          pubkey_commitment,
        }),`;
const replaceDest2 = `body: JSON.stringify({
          fullProof: proofData.fullProof,
          publicSignals: proofData.publicSignals,
          pubkey: pubkeyHex,
          salt,
        }),`;
content = content.replace(replaceSrc2, replaceDest2);

// Now replace setAuthCredentials
const replaceSrc3 = `setAuthCredentials({
        pubkey: pubkeyHex,
        secret: secretHex,
        pubkey_commitment,
        salt,
        expiry,
      });`;
const replaceDest3 = `setAuthCredentials({
        pubkey: pubkeyHex,
        salt,
        expiry,
        nonce,
      });`;
content = content.replace(replaceSrc3, replaceDest3);

fs.writeFileSync('apps/frontend/components/Auth/ZkAuthFlow.tsx', content);
