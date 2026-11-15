"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import {
  RULECASH_DECIMALS,
  USDC_PROGRAM,
  connection,
  merchantPda,
  rcAta,
  readonlyProgram,
  usdcAta,
} from "../../lib/chain";
import { buildRedeem, prepare, sendSigned } from "../../lib/actions";
import { InjectedWallet, getInjected, walletProgram } from "../../lib/wallet";

type Status = { kind: "ok" | "bad" | "info"; text: string } | null;

export default function MerchantPage() {
  const [wallet, setWallet] = useState<InjectedWallet | null>(null);
  const [owner, setOwner] = useState<PublicKey | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [rc, setRc] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWallet(getInjected());
  }, []);

  async function refresh(who: PublicKey) {
    try {
      const m = await readonlyProgram.account.merchant.fetchNullable(merchantPda(who));
      setApproved(!!m && m.active);
    } catch {
      setApproved(false);
    }
    const bal = async (addr: PublicKey, prog: PublicKey) => {
      try {
        return Number((await getAccount(connection, addr, "confirmed", prog)).amount) / 10 ** RULECASH_DECIMALS;
      } catch {
        return 0;
      }
    };
    setRc(await bal(rcAta(who), TOKEN_2022_PROGRAM_ID));
    setUsdc(await bal(usdcAta(who), USDC_PROGRAM));
  }

  async function connectWallet() {
    if (!wallet) {
      setStatus({ kind: "bad", text: "No Solana wallet found. Install Phantom." });
      return;
    }
    try {
      const { publicKey } = await wallet.connect();
      setOwner(publicKey);
      await refresh(publicKey);
    } catch (e: any) {
      setStatus({ kind: "bad", text: `Connect failed: ${e?.message ?? e}` });
    }
  }

  async function redeem() {
    if (!wallet || !owner) return;
    const value = Number(amount);
    if (!(value > 0)) {
      setStatus({ kind: "bad", text: "Enter an amount greater than 0." });
      return;
    }
    setBusy(true);
    try {
      setStatus({ kind: "info", text: "Building transaction…" });
      // Only the wallet's own Anchor program is needed to build; signing goes through the injected wallet.
      const program = walletProgram(wallet, owner);
      const tx = await prepare(connection, await buildRedeem(program, owner, value), owner);
      setStatus({ kind: "info", text: "Waiting for signature…" });
      const signed = await wallet.signTransaction(tx);
      const result = await sendSigned(connection, signed, false);
      if (result.error) {
        setStatus({ kind: "bad", text: `✗ Redeem failed: ${result.error}` });
      } else {
        setStatus({ kind: "ok", text: `✓ Redeemed ${value} RuleCash for USDC. ${result.signature.slice(0, 8)}…` });
      }
      await refresh(owner);
    } catch (e: any) {
      setStatus({ kind: "bad", text: `✗ Redeem failed: ${e?.message ?? String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Merchant</h1>
      <p className="muted">
        Approved merchants redeem RuleCash for USDC 1:1 from the vault. Redemption is only open to approved merchants, so
        grantees cannot cash out and escape the grant rules.
      </p>

      {!owner ? (
        <div className="card">
          <button onClick={connectWallet} disabled={!wallet}>Connect merchant wallet</button>
          {!wallet && <p className="bad">No Solana wallet detected.</p>}
        </div>
      ) : (
        <>
          <div className="card">
            <p>
              Wallet <span className="mono">{owner.toBase58()}</span>
            </p>
            <p>
              Status:{" "}
              {approved === null ? "…" : approved ? <span className="ok">approved merchant</span> : <span className="bad">not an approved merchant</span>}
            </p>
            <p>
              RuleCash: <strong>{rc ?? "…"}</strong> · USDC: <strong>{usdc ?? "…"}</strong>
            </p>
          </div>

          <div className="card">
            <div className="row">
              <div>
                <label className="muted" htmlFor="redeem-amount">Amount to redeem (RuleCash = USDC)</label>
                <input id="redeem-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <button onClick={redeem} disabled={busy || !approved}>{busy ? "Redeeming…" : "Redeem for USDC"}</button>
          </div>
        </>
      )}

      {status && <div className={`card ${status.kind === "ok" ? "ok" : status.kind === "bad" ? "bad" : "muted"}`}>{status.text}</div>}
    </>
  );
}
