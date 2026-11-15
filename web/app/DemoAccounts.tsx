"use client";

import { DEMO } from "../lib/chain";

// Who to be for each demo role. Import the matching key into Phantom (Add/Import wallet).
const ROWS: { role: string; address: string; keyFile: string }[] = [
  { role: "Issuer (runs the grant)", address: DEMO.issuer, keyFile: "~/.config/solana/id.json (Solana CLI wallet)" },
  { role: "Grantee: Team Alpha (500 spending budget)", address: DEMO.grantees[0].wallet, keyFile: "scripts/.demo-keys/grantee1.json" },
  { role: "Grantee: Team Beta", address: DEMO.grantees[1].wallet, keyFile: "scripts/.demo-keys/grantee2.json" },
  { role: "Merchant: Campus Hardware Store (approved)", address: DEMO.merchants[0].wallet, keyFile: "scripts/.demo-keys/hardwareStore.json" },
  { role: "Merchant: Pizza Co (approved)", address: DEMO.merchants[1].wallet, keyFile: "scripts/.demo-keys/pizzaCo.json" },
  { role: "Blocked Casino (not allowed by the grant)", address: DEMO.merchants[2].wallet, keyFile: "scripts/.demo-keys/casino.json" },
];

export default function DemoAccounts() {
  return (
    <div className="card">
      <h2>Demo accounts: who to be</h2>
      <p className="muted">
        Import one of these keys into Phantom (set Phantom to Devnet). Then use Switch account on a role page to change
        roles.
      </p>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Address</th>
            <th>Key to import</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.address}>
              <td>{r.role}</td>
              <td className="mono">{r.address.slice(0, 6)}…{r.address.slice(-4)}</td>
              <td className="mono">{r.keyFile}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
