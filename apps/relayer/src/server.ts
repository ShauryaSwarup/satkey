/**
 * server.ts — Sat Key Relayer Service
 *
 * POST /relay
 *   Body: { proof: string, publicSignals: string[], starknetAddress: string }
 *   Returns: { transactionHash: string }
 */

import express from "express";
import cors from "cors";
import "dotenv/config";

import { submitRelayTransaction, RelayRequest } from "./relay";
import { deployAccount, DeployRequest } from "./deploy";

const app = express();
const PORT = parseInt(process.env.PORT || "3002", 10);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "satkey-relayer" });
});

// ── POST /relay ───────────────────────────────────────────────────────────────
app.post("/relay", async (req, res) => {
  const body = req.body as Partial<RelayRequest>;

  if (!body.proof) {
    res.status(400).json({ error: "Missing required field: proof" });
    return;
  }
  if (!Array.isArray(body.publicSignals) || body.publicSignals.length < 4) {
    res
      .status(400)
      .json({ error: "publicSignals must be an array of at least 4 felts" });
    return;
  }
  if (!body.starknetAddress) {
    res.status(400).json({ error: "Missing required field: starknetAddress" });
    return;
  }

  try {
    const result = await submitRelayTransaction(body as RelayRequest);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[relayer] Error:", message);
    res.status(500).json({ error: message });
  }
});

app.post("/deploy-account", async (req, res) => {
  const body = req.body as Partial<DeployRequest>;

  if (!body.proof || !body.pubkey) {
    res.status(400).json({ error: "Missing required fields: proof, pubkey" });
    return;
  }
  if (!Array.isArray(body.publicSignals) || body.publicSignals.length < 4) {
    res
      .status(400)
      .json({ error: "publicSignals must be an array of at least 4 felts" });
    return;
  }

  try {
    const result = await deployAccount(body as DeployRequest);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[relayer] Deploy error:", message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`[relayer] Listening on http://localhost:${PORT}`);
});

export default app;
