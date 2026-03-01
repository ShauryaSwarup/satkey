import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateProof } from "./dist/proof.js";

const CIRCUIT_DIR = path.resolve("../../circuits/satkey_auth");

async function run() {
  console.log("Starting refactor verification...");
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "satkey-test-"));
  console.log("Work dir:", workDir);

  const toml = `# UNIQUE FOR REFACTOR TEST ${Date.now()}
pubkey_x = [27, 132, 197, 86, 123, 18, 100, 64, 153, 93, 62, 213, 170, 186, 5, 101, 215, 30, 24, 52, 96, 72, 25, 255, 156, 23, 245, 233, 213, 221, 7, 143]
pubkey_y = [112, 190, 175, 143, 88, 139, 84, 21, 7, 254, 214, 166, 66, 197, 171, 66, 223, 223, 129, 32, 167, 246, 57, 222, 81, 34, 212, 122, 105, 168, 232, 209]
sig_r = [244, 101, 97, 87, 198, 45, 234, 200, 141, 35, 233, 61, 82, 196, 100, 196, 59, 224, 229, 207, 13, 116, 16, 184, 242, 96, 129, 139, 151, 203, 207, 148]
sig_s = [97, 133, 248, 75, 31, 5, 74, 159, 210, 167, 254, 54, 146, 154, 145, 202, 61, 45, 43, 81, 187, 172, 11, 135, 214, 34, 60, 22, 104, 133, 129, 103]
message_hash = [132, 59, 7, 0, 250, 97, 174, 7, 193, 115, 166, 234, 150, 216, 3, 249, 120, 120, 121, 191, 38, 124, 30, 125, 217, 103, 222, 56, 86, 163, 249, 253]
nonce = "0x1"
expiry = "0x2"`;

  fs.writeFileSync(path.join(workDir, "Prover.toml"), toml);

  try {
    const result = await generateProof(workDir, CIRCUIT_DIR);
    console.log("✅ Proof generated successfully!");
    console.log("FullProof length:", result.fullProof.length);
    console.log("Public Signals:", result.publicSignals);
    
    // Check if original Prover.toml was touched (it shouldn't be)
    const originalProverToml = path.join(CIRCUIT_DIR, "Prover.toml");
    if (fs.existsSync(originalProverToml)) {
        const content = fs.readFileSync(originalProverToml, "utf8");
        if (content === toml) {
            console.log("❌ FAILURE: Original Prover.toml was overwritten!");
        } else {
            console.log("✅ SUCCESS: Original Prover.toml was NOT overwritten.");
        }
    } else {
        console.log("✅ SUCCESS: Original Prover.toml does not exist.");
    }

  } catch (err) {
    console.error("❌ Refactor verification FAILED:", err);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

run();
