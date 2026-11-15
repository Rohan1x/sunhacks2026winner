"use client";

import { PublicKey } from "@solana/web3.js";
import { getInjected } from "../lib/wallet";

// Shows which account (role) the site is using, and a Switch button.
// Switch disconnects this site from the wallet. Clicking Connect again makes Phantom ask which account to use.
export default function WalletBar({
  owner,
  role,
  onSwitch,
}: {
  owner: PublicKey | null;
  role: string;
  onSwitch: () => void;
}) {
  if (!owner) return null;
  return (
    <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div>
        <div className="muted">Acting as: {role}</div>
        <div className="mono">{owner.toBase58()}</div>
      </div>
      <button
        onClick={async () => {
          try {
            await getInjected()?.disconnect?.();
          } catch {
            /* ignore: the site state is cleared either way */
          }
          onSwitch();
        }}
      >
        Switch account
      </button>
    </div>
  );
}
