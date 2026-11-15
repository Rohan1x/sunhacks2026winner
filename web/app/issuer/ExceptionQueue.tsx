"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { DEMO, GRANT, MINT, CASHRULES_DECIMALS, connection, readonlyProgram } from "../../lib/chain";
import { buildDecideException, prepare, sendSigned } from "../../lib/actions";
import { InjectedWallet, describeError, walletProgram } from "../../lib/wallet";

type Ex = {
  id: number;
  payer: string;
  merchant: string;
  amount: number;
  status: number;
  reason: string;
  createdAt: number;
};

const STATUS = ["pending", "approved", "rejected"];

// Pending and decided exception requests for this grant, newest first.
export default function ExceptionQueue({
  wallet,
  issuer,
  isIssuer,
}: {
  wallet: InjectedWallet | null;
  issuer: PublicKey | null;
  isIssuer: boolean;
}) {
  const [items, setItems] = useState<Ex[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await readonlyProgram.account.exception.all([{ memcmp: { offset: 8, bytes: MINT.toBase58() } }]);
      setItems(
        rows
          .map(({ account: a }) => ({
            id: Number(a.id.toString()),
            payer: a.payer.toBase58(),
            merchant: a.merchant.toBase58(),
            amount: Number(a.amount.toString()) / 10 ** CASHRULES_DECIMALS,
            status: a.status,
            reason: Buffer.from(a.reason.slice(0, a.reasonLen)).toString("utf8"),
            createdAt: Number(a.createdAt.toString()),
          }))
          .sort((x, y) => y.id - x.id)
      );
    } catch (e) {
      console.error("exception load failed", e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(item: Ex, approve: boolean) {
    if (!wallet || !issuer) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      const program = walletProgram(wallet, issuer);
      // Approve pays the requested merchant. Reject forfeits the escrowed funds to the treasury (the issuer's
      // own CashRules account, which is the grant's treasury in the demo).
      const destination = approve ? new PublicKey(item.merchant) : issuer;
      const built = await buildDecideException(program, issuer, item.id, approve, destination, item.amount);
      const tx = await prepare(connection, built, issuer);
      const signed = await wallet.signTransaction(tx);
      const result = await sendSigned(connection, signed, false);
      if (result.error) {
        setMessage({ kind: "bad", text: `✗ ${approve ? "Approve" : "Reject"} failed: ${result.error}` });
      } else {
        setMessage({
          kind: "ok",
          text: `✓ Request #${item.id} ${approve ? "approved: merchant paid" : "rejected: amount forfeited"}.`,
        });
      }
      await load();
    } catch (e) {
      console.error("decide failed", e);
      setMessage({ kind: "bad", text: `✗ ${describeError(e)}` });
    } finally {
      setBusyId(null);
    }
  }

  const pending = items.filter((i) => i.status === 0);
  const decided = items.filter((i) => i.status !== 0).slice(0, 5);

  return (
    <div className="card">
      <h2>Exception requests</h2>
      <p className="muted">
        Out-of-policy payments wait here. Approve to pay the merchant. Reject to forfeit the escrowed amount.
      </p>
      {items.length === 0 && <p className="muted">No requests yet.</p>}
      {pending.map((i) => (
        <div key={i.id} className="card" style={{ margin: "8px 0" }}>
          <p>
            <strong>#{i.id}</strong> · {i.amount.toLocaleString()} CashRules to{" "}
            <span className="mono">{DEMO.merchants.find((m) => m.wallet === i.merchant)?.name ?? i.merchant.slice(0, 8) + "…"}</span>
          </p>
          <p className="muted">From {i.payer.slice(0, 8)}… · reason: “{i.reason}”</p>
          <div className="row">
            <button onClick={() => decide(i, true)} disabled={!isIssuer || busyId !== null}>Approve</button>
            <button onClick={() => decide(i, false)} disabled={!isIssuer || busyId !== null}>Reject (forfeit)</button>
          </div>
        </div>
      ))}
      {decided.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {decided.map((i) => (
              <tr key={i.id}>
                <td>{i.id}</td>
                <td>{i.amount.toLocaleString()}</td>
                <td>{i.reason}</td>
                <td className={i.status === 1 ? "ok" : "bad"}>{STATUS[i.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {message && <p className={message.kind === "ok" ? "ok" : "bad"}>{message.text}</p>}
      <p>
        <button onClick={load}>Refresh</button>
      </p>
    </div>
  );
}
