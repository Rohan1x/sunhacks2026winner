"use client";

import { useEffect, useState } from "react";
import {
  CATEGORY_NAMES,
  DEMO,
  DashboardState,
  FeedItem,
  loadDashboard,
  loadFeed,
} from "../lib/chain";

const POLL_MS = 5000;

function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function categoryList(bits: number) {
  const names: string[] = [];
  for (let i = 0; i < 32; i++) {
    if ((bits >> i) & 1) names.push(CATEGORY_NAMES[i] ?? `Category ${i}`);
  }
  return names.length ? names.join(", ") : "none";
}

export default function Dashboard() {
  const [dash, setDash] = useState<DashboardState | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [d, f] = await Promise.all([loadDashboard(), loadFeed()]);
        if (!cancelled) {
          setDash(d);
          setFeed(f);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const blocked = feed.filter((f) => f.kind === "blocked").length;

  const resultLabel = (f: FeedItem) => {
    switch (f.kind) {
      case "paid":
        return { text: "✓ paid", cls: "ok" };
      case "blocked":
        return { text: "✗ blocked", cls: "bad" };
      case "funded":
        return { text: "funded", cls: "ok" };
      case "redeemed":
        return { text: "redeemed", cls: "ok" };
      default:
        return { text: "✗ failed", cls: "bad" };
    }
  };

  return (
    <>
      <h1>Grant dashboard</h1>
      <p className="muted">
        Cluster: <span className="mono">{DEMO.cluster}</span> · Mint:{" "}
        <span className="mono">{shortAddr(DEMO.rulecashMint)}</span>
      </p>
      {error && <div className="card bad">Could not load chain state: {error}</div>}

      {dash && (
        <div className="grid">
          <div className="card stat">
            <div className="muted">RuleCash supply</div>
            <div className="value">{dash.supply.toLocaleString()}</div>
          </div>
          <div className="card stat">
            <div className="muted">USDC in vault</div>
            <div className="value">{dash.vaultUsdc.toLocaleString()}</div>
          </div>
          <div className="card stat">
            <div className="muted">Daily cap / grantee</div>
            <div className="value">{dash.dailyCap.toLocaleString()}</div>
          </div>
          <div className="card stat">
            <div className="muted">Blocked attempts (recent)</div>
            <div className="value bad">{blocked}</div>
          </div>
        </div>
      )}

      {dash && (
        <div className="card">
          <h2>Allowed categories</h2>
          <p>{categoryList(dash.allowedCategories)}</p>
          <p className="muted">
            Backing check: vault USDC {dash.vaultUsdc} {dash.vaultUsdc === dash.supply ? "=" : "≠"} supply{" "}
            {dash.supply}
          </p>
        </div>
      )}

      {dash && (
        <div className="card">
          <h2>Approved merchants</h2>
          <table>
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Name</th>
                <th>Category</th>
                <th>Per-tx cap</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dash.merchants.map((m) => {
                const demo = DEMO.merchants.find((d) => d.wallet === m.wallet);
                return (
                  <tr key={m.wallet}>
                    <td className="mono">{shortAddr(m.wallet)}</td>
                    <td>{demo?.name ?? "—"}</td>
                    <td>{CATEGORY_NAMES[m.category] ?? m.category}</td>
                    <td>{m.perTxCap.toLocaleString()}</td>
                    <td className={m.active ? "ok" : "bad"}>{m.active ? "active" : "inactive"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Live spend feed</h2>
        <p className="muted">Every RuleCash transfer and redemption, paid or rejected by the chain.</p>
        <table>
          <thead>
            <tr>
              <th>Result</th>
              <th>Amount</th>
              <th>Detail</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {feed.map((f) => {
              const r = resultLabel(f);
              return (
                <tr key={f.signature}>
                  <td className={r.cls}>{r.text}</td>
                  <td>{f.amount !== null ? f.amount.toLocaleString() : "—"}</td>
                  <td>{f.detail ?? ""}</td>
                  <td className="mono" title={f.signature}>{shortAddr(f.signature)}</td>
                </tr>
              );
            })}
            {feed.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">No activity yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
