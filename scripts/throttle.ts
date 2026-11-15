import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";

// Public devnet RPC rate-limits bursts (HTTP 429). RPC_THROTTLE_MS spaces out requests; 0 disables.
export function throttledProvider(): anchor.AnchorProvider {
  const base = anchor.AnchorProvider.env();
  const ms = Number(process.env.RPC_THROTTLE_MS ?? 0);
  const connection = new Connection(base.connection.rpcEndpoint, {
    commitment: "confirmed",
    fetchMiddleware: ms
      ? async (info, init, fetch) => {
          await new Promise((r) => setTimeout(r, ms));
          return fetch(info, init);
        }
      : undefined,
  });
  return new anchor.AnchorProvider(connection, base.wallet, { commitment: "confirmed" });
}
