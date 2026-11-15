"use client";

import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import {
  CATEGORY_NAMES,
  DEMO,
  GRANT,
  CASHRULES_DECIMALS,
  connection,
  loadSpentToday,
  rcAta,
  readonlyProgram,
} from "../../lib/chain";
import { buildPay, buildRequestException, prepare, sendSigned } from "../../lib/actions";
import WalletBar from "../WalletBar";
import { InjectedWallet, describeError, getInjected, walletProgram } from "../../lib/wallet";

type Status = { kind: "ok" | "bad" | "info"; text: string } | null;

export default function Pay() {
  const [wallet, setWallet] = useState<InjectedWallet | null>(null);
  const [owner, setOwner] = useState<PublicKey | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [spentToday, setSpentToday] = useState<number | null>(null);
  const [dailyCap, setDailyCap] = useState<number | null>(null);
  const [merchantWallet, setMerchantWallet] = useState(DEMO.merchants[0]?.wallet ?? "");
  const [amount, setAmount] = useState("25");
  const [outOfPolicy, setOutOfPolicy] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const merchant = useMemo(() => DEMO.merchants.find((m) => m.wallet === merchantWallet), [merchantWallet]);

  async function refreshAccount(who: PublicKey) {
    try {
      const acct = await getAccount(connection, rcAta(who), "confirmed", TOKEN_2022_PROGRAM_ID);
      setBalance(Number(acct.amount) / 10 ** CASHRULES_DECIMALS);
    } catch {
      setBalance(0);
    }
    setSpentToday(await loadSpentToday(who));
    const grant = await readonlyProgram.account.grant.fetch(GRANT);
    setDailyCap(Number(grant.dailyCap.toString()) / 10 ** CASHRULES_DECIMALS);
  }

  // Forget this account. The next Connect asks Phantom which account to use.
  function disconnect() {
    setOwner(null);
    setStatus(null);
  }

  async function connectWallet() {
    const w = getInjected();
    if (!w) {
      setStatus({ kind: "bad", text: "No Solana wallet found. Install Phantom and set its network to the demo cluster." });
      return;
    }
    try {
      setWallet(w);
      const { publicKey } = await w.connect();
      const key = new PublicKey(publicKey.toString());
      setOwner(key);
      await refreshAccount(key);
    } catch (e: any) {
      setStatus({ kind: "bad", text: `Wallet connect failed: ${e?.message ?? e}` });
    }
  }

  async function pay() {
    if (!wallet || !owner || !merchant) return;
    const value = Number(amount);
    if (!(value > 0)) {
      setStatus({ kind: "bad", text: "Enter an amount greater than 0." });
      return;
    }
    setBusy(true);
    try {
      setStatus({ kind: "info", text: "Building transaction…" });
      const tx = await prepare(connection, buildPay(owner, new PublicKey(merchant.wallet), value), owner);
      setStatus({ kind: "info", text: "Waiting for signature…" });
      const signed = await wallet.signTransaction(tx);
      // skipPreflight: a rule violation must land on-chain so it shows in the live feed as blocked.
      const result = await sendSigned(connection, signed, true);
      if (result.error) {
        setStatus({
          kind: "bad",
          text: `✗ Blocked on-chain: ${result.error}. It shows in the live feed. You can send an exception request below with an explanation.`,
        });
        setOutOfPolicy(true);
      } else {
        setStatus({ kind: "ok", text: `✓ Paid ${value} to ${merchant.name}.` });
      }
      await refreshAccount(owner);
    } catch (e: any) {
      console.error("pay failed", e);
      setStatus({ kind: "bad", text: `✗ ${describeError(e)}` });
    } finally {
      setBusy(false);
    }
  }

  // Out-of-policy request: the payer's CashRules move into escrow with a reason. The issuer decides.
  async function requestException() {
    if (!wallet || !owner || !merchant) return;
    const value = Number(amount);
    if (!(value > 0)) {
      setStatus({ kind: "bad", text: "Enter an amount greater than 0." });
      return;
    }
    if (reason.trim().length < 5) {
      setStatus({ kind: "bad", text: "Explain why this payment is needed (at least a few words). The issuer reads it." });
      return;
    }
    setBusy(true);
    try {
      setStatus({ kind: "info", text: "Building exception request…" });
      const program = walletProgram(wallet, owner);
      const built = await buildRequestException(program, owner, new PublicKey(merchant.wallet), value, reason.trim());
      const tx = await prepare(connection, built, owner);
      setStatus({ kind: "info", text: "Waiting for signature…" });
      const signed = await wallet.signTransaction(tx);
      const result = await sendSigned(connection, signed, false);
      if (result.error) {
        setStatus({ kind: "bad", text: `✗ Request failed: ${result.error}` });
      } else {
        setStatus({
          kind: "ok",
          text: `✓ Request sent: ${value} CashRules for ${merchant.name} is held in escrow until the issuer decides. If it's declined, the amount is forfeited.`,
        });
        setOutOfPolicy(false);
        setReason("");
      }
      await refreshAccount(owner);
    } catch (e: any) {
      console.error("request failed", e);
      setStatus({ kind: "bad", text: `✗ ${describeError(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Pay with CashRules</h1>

      <WalletBar owner={owner} role="Grantee (pays)" onSwitch={disconnect} />
      <p className="muted">
        Payments succeed only at approved merchants, within the merchant cap and your daily cap. Anything else is
        rejected by the chain.
      </p>

      <div className="card">
        {!owner ? (
          <button onClick={connectWallet}>Connect wallet</button>
        ) : (
          <p>
            Connected <span className="mono">{owner.toBase58()}</span>
            <br />
            Balance: <strong>{balance === null ? "…" : balance.toLocaleString()} CashRules</strong>
            {" · "}Daily cap left:{" "}
            <strong>
              {spentToday === null || dailyCap === null ? "…" : Math.max(0, dailyCap - spentToday).toLocaleString()} of{" "}
              {dailyCap === null ? "…" : dailyCap.toLocaleString()}
            </strong>
          </p>
        )}
      </div>

      <div className="card">
        <div className="row">
          <div>
            <label className="muted" htmlFor="merchant">Merchant</label>
            <select id="merchant" value={merchantWallet} onChange={(e) => setMerchantWallet(e.target.value)}>
              {DEMO.merchants.map((m) => (
                <option key={m.wallet} value={m.wallet}>
                  {m.name} ({CATEGORY_NAMES[m.category] ?? m.category}){m.blockedByGrant ? " — not allowed by grant" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" htmlFor="amount">Amount (CashRules)</label>
            <input id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <p className="muted">{merchant ? `Per-tx cap for this merchant: ${merchant.perTxCap}.` : ""}</p>
        <button onClick={pay} disabled={!owner || busy || !merchant}>{busy ? "Working…" : "Pay"}</button>
      </div>

      <div className="card">
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={outOfPolicy}
            onChange={(e) => setOutOfPolicy(e.target.checked)}
          />
          This payment is outside the policy. Request an exception.
        </label>
        {outOfPolicy && (
          <>
            <p className="muted">
              The issuer reviews the request. Your CashRules are held in escrow until then. If the issuer approves, the
              merchant is paid. If the issuer declines, the amount is forfeited (you are charged).
            </p>
            <label className="muted" htmlFor="reason">Why is this payment needed?</label>
            <textarea
              id="reason"
              rows={3}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Vendor is the only supplier for a replacement part we need this week."
            />
            <p className="muted">{reason.length}/200</p>
            <button onClick={requestException} disabled={!owner || busy || !merchant}>
              {busy ? "Working…" : "Send exception request"}
            </button>
          </>
        )}
      </div>

      {status && (
        <div className={`card ${status.kind === "ok" ? "ok" : status.kind === "bad" ? "bad" : "muted"}`}>{status.text}</div>
      )}
    </>
  );
}
