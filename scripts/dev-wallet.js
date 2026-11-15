// Dev-only browser test wallet. Mimics the Phantom surface the app uses (connect, signTransaction,
// signAllTransactions) and signs through scripts/dev-signer.ts on 127.0.0.1:4020.
// Paste into the browser console, or run via the browser tool, on the app page:
//   useDevWallet("grantee1")   // or "grantee2", "hardwareStore", "pizzaCo", "issuer"
// Then click the app's Connect button. Nothing here holds a private key.
(function () {
  const SIGNER = "http://127.0.0.1:4020";
  const toB64 = (u8) => {
    let s = "";
    for (const b of u8) s += String.fromCharCode(b);
    return btoa(s);
  };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  function makeDevWallet(name) {
    let accountKey = null;
    async function accounts() {
      return (await (await fetch(SIGNER + "/accounts")).json());
    }
    async function signOne(tx) {
      const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const res = await fetch(SIGNER + "/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx: toB64(bytes) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "sign failed");
      const signed = fromB64(body.tx);
      // The app only calls serialize() on the signed result, so a minimal object is enough.
      return { serialize: () => signed };
    }
    return {
      isPhantom: true,
      isDevWallet: true,
      name,
      get publicKey() {
        return accountKey;
      },
      async connect() {
        const all = await accounts();
        if (!all[name]) throw new Error(`unknown dev account ${name}`);
        accountKey = { toString: () => all[name], toBase58: () => all[name] };
        return { publicKey: accountKey };
      },
      async disconnect() {
        accountKey = null;
      },
      signTransaction: signOne,
      async signAllTransactions(txs) {
        const out = [];
        for (const t of txs) out.push(await signOne(t));
        return out;
      },
    };
  }

  window.useDevWallet = function (name) {
    window.phantom = { solana: makeDevWallet(name) };
    return "dev wallet set to " + name + " (connect in the app now)";
  };
})();
