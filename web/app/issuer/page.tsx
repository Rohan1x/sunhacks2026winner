"use client";

import { useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  CATEGORY_NAMES,
  DashboardState,
  DEMO,
  GRANT,
  hasSpendAccount,
  loadDashboard,
  merchantPda,
  connection,
} from "../../lib/chain";
import {
  Program_,
  buildAddMerchant,
  buildFundGrantee,
  buildSetMerchant,
  buildSetPolicy,
  prepare,
  sendSigned,
} from "../../lib/actions";
import WalletBar from "../WalletBar";
import { InjectedWallet, errorName, getInjected, walletProgram } from "../../lib/wallet";
import ExceptionQueue from "./ExceptionQueue";

type Status = { kind: "ok" | "bad" | "info"; text: string } | null;

const CATEGORY_OPTIONS = Object.entries(CATEGORY_NAMES).map(([bit, name]) => ({ bit: Number(bit), name }));

export default function IssuerPage() {
  const [wallet, setWallet] = useState<InjectedWallet | null>(null);
  const [owner, setOwner] = useState<PublicKey | null>(null);
  const [dash, setDash] = useState<DashboardState | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  // policy form
  const [policyBits, setPolicyBits] = useState<number[]>([]);
  const [policyCap, setPolicyCap] = useState("500");

  // add merchant form
  const [newWallet, setNewWallet] = useState("");
  const [newCategory, setNewCategory] = useState("0");
  const [newCap, setNewCap] = useState("100");

  // fund grantee form
  const [fundWallet, setFundWallet] = useState("");
  const [fundAmount, setFundAmount] = useState("100");

  const isIssuer = !!owner && owner.toBase58() === DEMO.issuer;

  async function refresh() {
    try {
      const d = await loadDashboard();
      setDash(d);
      const bits: number[] = [];
      for (let i = 0; i < 32; i++) if ((d.allowedCategories >> i) & 1) bits.push(i);
      setPolicyBits(bits);
      setPolicyCap(String(d.dailyCap));
    } catch (e: any) {
      setStatus({ kind: "bad", text: `Could not load grant: ${e?.message ?? e}` });
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Forget this account. The next Connect asks Phantom which account to use.
  function disconnect() {
    setOwner(null);
    setStatus(null);
  }

  async function connectWallet() {
    const w = getInjected();
    if (!w) {
      setStatus({ kind: "bad", text: "No Solana wallet found. Install Phantom." });
      return;
    }
    try {
      setWallet(w);
      const { publicKey } = await w.connect();
      const key = new PublicKey(publicKey.toString());
      setOwner(key);
    } catch (e: any) {
      setStatus({ kind: "bad", text: `Connect failed: ${e?.message ?? e}` });
    }
  }

  // Build an issuer transaction, sign with the connected wallet, send, and report.
  async function run(label: string, build: (program: Program_) => Promise<Transaction>) {
    if (!wallet || !owner) return;
    setBusy(true);
    setStatus({ kind: "info", text: `${label}: waiting for signature…` });
    try {
      const program = walletProgram(wallet, owner);
      const tx = await prepare(connection, await build(program), owner);
      const signed = await wallet.signTransaction(tx);
      const result = await sendSigned(connection, signed, false);
      if (result.error) {
        setStatus({ kind: "bad", text: `✗ ${label} failed: ${result.error}` });
      } else {
        setStatus({ kind: "ok", text: `✓ ${label} done. ${result.signature.slice(0, 8)}…` });
        await refresh();
      }
    } catch (e: any) {
      setStatus({ kind: "bad", text: `✗ ${label} failed: ${errorName(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const toggleMerchant = (m: DashboardState["merchants"][number]) =>
    run(m.active ? "Pause merchant" : "Reactivate merchant", (program) =>
      buildSetMerchant(program, owner!, new PublicKey(m.wallet), m.category, m.perTxCap, !m.active)
    );

  const addMerchant = () => {
    let merchantWallet: PublicKey;
    try {
      merchantWallet = new PublicKey(newWallet.trim());
    } catch {
      setStatus({ kind: "bad", text: "Merchant wallet is not a valid address." });
      return;
    }
    const cap = Number(newCap);
    if (!(cap > 0)) {
      setStatus({ kind: "bad", text: "Per-tx cap must be greater than 0." });
      return;
    }
    run("Add merchant", (program) =>
      buildAddMerchant(program, owner!, merchantWallet, Number(newCategory), cap)
    );
  };

  const savePolicy = () => {
    const bits = policyBits.reduce((acc, b) => acc | (1 << b), 0) >>> 0;
    const cap = Number(policyCap);
    if (!(cap > 0)) {
      setStatus({ kind: "bad", text: "Daily cap must be greater than 0." });
      return;
    }
    run("Save policy", (program) => buildSetPolicy(program, owner!, bits, cap));
  };

  const fundGrantee = async () => {
    let grantee: PublicKey;
    try {
      grantee = new PublicKey(fundWallet.trim());
    } catch {
      setStatus({ kind: "bad", text: "Grantee wallet is not a valid address." });
      return;
    }
    const amount = Number(fundAmount);
    if (!(amount > 0)) {
      setStatus({ kind: "bad", text: "Amount must be greater than 0." });
      return;
    }
    const needsSpend = !(await hasSpendAccount(grantee));
    run("Fund grantee", (program) => buildFundGrantee(program, owner!, grantee, amount, needsSpend));
  };

  const togglePolicyBit = (bit: number) =>
    setPolicyBits((prev) => (prev.includes(bit) ? prev.filter((b) => b !== bit) : [...prev, bit]));

  return (
    <>
      <h1>Issuer console</h1>

      <WalletBar owner={owner} role="Issuer (runs the grant)" onSwitch={disconnect} />
      <p className="muted">Manage the grant: approve or pause merchants, set the category policy and daily cap, and fund grantees.</p>

      {!owner ? (
        <div className="card">
          <button onClick={connectWallet}>Connect issuer wallet</button>
        </div>
      ) : !isIssuer ? (
        <div className="card bad">
          Connected as <span className="mono">{owner.toBase58()}</span>. This is not the grant issuer. Connect the issuer wallet to make changes.
        </div>
      ) : (
        <div className="card ok">Connected as issuer <span className="mono">{owner.toBase58()}</span></div>
      )}

      {dash && (
        <div className="card">
          <h2>Merchants</h2>
          <table>
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Category</th>
                <th>Per-tx cap</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dash.merchants.map((m) => {
                const name = DEMO.merchants.find((d) => d.wallet === m.wallet)?.name ?? "";
                return (
                  <tr key={m.wallet}>
                    <td className="mono">{name ? `${name} · ` : ""}{m.wallet.slice(0, 4)}…{m.wallet.slice(-4)}</td>
                    <td>{CATEGORY_NAMES[m.category] ?? m.category}</td>
                    <td>{m.perTxCap.toLocaleString()}</td>
                    <td className={m.active ? "ok" : "bad"}>{m.active ? "active" : "paused"}</td>
                    <td>
                      <button onClick={() => toggleMerchant(m)} disabled={!isIssuer || busy}>
                        {m.active ? "Pause" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Add merchant</h2>
        <div className="row">
          <div>
            <label className="muted" htmlFor="m-wallet">Wallet</label>
            <input id="m-wallet" value={newWallet} onChange={(e) => setNewWallet(e.target.value)} />
          </div>
          <div>
            <label className="muted" htmlFor="m-cat">Category</label>
            <select id="m-cat" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((c) => <option key={c.bit} value={c.bit}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="muted" htmlFor="m-cap">Per-tx cap</label>
            <input id="m-cap" type="number" min="0" step="0.01" value={newCap} onChange={(e) => setNewCap(e.target.value)} />
          </div>
        </div>
        <p><button onClick={addMerchant} disabled={!isIssuer || busy}>Add merchant</button></p>
      </div>

      <div className="card">
        <h2>Policy</h2>
        <p className="muted">Categories grantees may spend in. Changing these applies to all future payments.</p>
        <p>
          {CATEGORY_OPTIONS.map(({ bit, name }) => (
            <label key={bit} style={{ marginRight: 14 }}>
              <input
                type="checkbox"
                style={{ width: "auto", marginRight: 6 }}
                checked={policyBits.includes(bit)}
                onChange={() => togglePolicyBit(bit)}
              />
              {name}
            </label>
          ))}
        </p>
        <div className="row">
          <div>
            <label className="muted" htmlFor="p-cap">Daily cap per grantee</label>
            <input id="p-cap" type="number" min="0" step="0.01" value={policyCap} onChange={(e) => setPolicyCap(e.target.value)} />
          </div>
        </div>
        <p><button onClick={savePolicy} disabled={!isIssuer || busy}>Save policy</button></p>
      </div>

      <ExceptionQueue wallet={wallet} issuer={owner} isIssuer={isIssuer} />

      <div className="card">
        <h2>Fund grantee</h2>
        <p className="muted">Locks USDC in the vault and mints CashRules 1:1 to the grantee.</p>
        <div className="row">
          <div>
            <label className="muted" htmlFor="f-wallet">Grantee wallet</label>
            <input id="f-wallet" value={fundWallet} onChange={(e) => setFundWallet(e.target.value)} />
          </div>
          <div>
            <label className="muted" htmlFor="f-amount">Amount</label>
            <input id="f-amount" type="number" min="0" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
          </div>
        </div>
        <p><button onClick={fundGrantee} disabled={!isIssuer || busy}>Fund grantee</button></p>
      </div>

      {status && <div className={`card ${status.kind === "ok" ? "ok" : status.kind === "bad" ? "bad" : "muted"}`}>{status.text}</div>}
    </>
  );
}
