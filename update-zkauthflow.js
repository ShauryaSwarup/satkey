const fs = require('fs');

let content = fs.readFileSync('apps/frontend/components/Auth/ZkAuthFlow.tsx', 'utf8');

// Replace the setup and prover calls
content = content.replace(
  /const expiry = \(Date\.now\(\) \+ 5 \* 60 \* 1000\)\.toString\(\);[\s\S]*?const deployResponse = await fetch/m,
  `const expiry = Math.floor(Date.now() / 1000 + 5 * 60).toString(); // Unix timestamp in seconds
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
      const salt = proofData.salt;
      
      setZkProof(proofData);
      setStep("deploying");

      const deployResponse = await fetch`
);

// Update AuthCredentials setting and Deploy arguments
content = content.replace(
  /body: JSON\.stringify\(\{[\s\S]*?pubkey_commitment,\n\s*\}\),/m,
  `body: JSON.stringify({
          fullProof: proofData.fullProof,
          publicSignals: proofData.publicSignals,
          pubkey: pubkeyHex,
          salt,
        }),`
);

content = content.replace(
  /setAuthCredentials\(\{[\s\S]*?expiry,\n\s*\}\);/m,
  `setAuthCredentials({
        pubkey: pubkeyHex,
        salt,
        expiry,
        nonce,
      });`
);

fs.writeFileSync('apps/frontend/components/Auth/ZkAuthFlow.tsx', content);
