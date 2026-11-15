/**
 * Local test signer for the web app. Dev only.
 *
 * Holds the demo keys (scripts/.demo-keys) and the issuer key (ANCHOR_WALLET), and signs transactions
 * sent from the browser test wallet (scripts/dev-wallet.js). Binds to 127.0.0.1 only and never
 * leaves this machine. Keys stay here; the browser never sees them.
 *
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node --transpile-only scripts/dev-signer.ts
 *
 * Endpoints:
 *   GET  /accounts          -> { name: publicKey } for every known key
 *   POST /sign  {tx}        -> { tx } (base64 transaction, signed by the fee payer's key)
 */
import { Keypair, Transaction } from "@solana/web3.js";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";

const KEYS = path.join(__dirname, ".demo-keys");
const PORT = 4020;

const byPubkey = new Map<string, Keypair>();
const names: Record<string, string> = {};

for (const file of fs.readdirSync(KEYS)) {
  if (!file.endsWith(".json") || file === "rulecash.json") continue; // rulecash.json is the mint, not a wallet
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, file), "utf8"))));
  const name = path.basename(file, ".json");
  byPubkey.set(kp.publicKey.toBase58(), kp);
  names[name] = kp.publicKey.toBase58();
}

// Issuer key from the Solana CLI wallet.
const issuerPath = process.env.ANCHOR_WALLET ?? path.join(process.env.HOME ?? "", ".config/solana/id.json");
const issuer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(issuerPath, "utf8"))));
byPubkey.set(issuer.publicKey.toBase58(), issuer);
names["issuer"] = issuer.publicKey.toBase58();

const send = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method === "GET" && req.url === "/accounts") return send(res, 200, names);
    if (req.method === "POST" && req.url === "/sign") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const { tx } = JSON.parse(raw);
          const t = Transaction.from(Buffer.from(tx, "base64"));
          const feePayer = t.feePayer?.toBase58();
          const kp = feePayer ? byPubkey.get(feePayer) : undefined;
          if (!kp) return send(res, 400, { error: `no key for fee payer ${feePayer}` });
          t.partialSign(kp);
          send(res, 200, { tx: t.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64") });
        } catch (e: any) {
          send(res, 400, { error: e?.message ?? String(e) });
        }
      });
      return;
    }
    send(res, 404, { error: "not found" });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`dev signer on http://127.0.0.1:${PORT} (${byPubkey.size} keys)`);
  });

