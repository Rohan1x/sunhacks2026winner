// Pre-demo check: is everything the demo needs up and in the expected state?
// Usage: node scripts/demo-preflight.js
const fs = require("fs");
const path = require("path");
const { Connection, PublicKey } = require("@solana/web3.js");
const { getMint, getAccount, TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");

const demo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "lib", "demo.json"), "utf8"));
const LIVE = "https://rohan1x.github.io/sunhacks2026winner/app/";
const conn = new Connection(demo.cluster || "https://api.devnet.solana.com", "confirmed");
let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
};

(async () => {
  // 1. RPC reachable
  try {
    await conn.getLatestBlockhash();
    check(true, "devnet RPC responds");
  } catch (e) {
    check(false, "devnet RPC responds", String(e.message || e));
  }

  // 2. Program deployed and executable
  const prog = await conn.getAccountInfo(new PublicKey(demo.programId));
  check(!!prog && prog.executable, "program deployed", demo.programId);

  // 3. Grant exists; backing check
  const grantInfo = await conn.getAccountInfo(new PublicKey(demo.grant));
  check(!!grantInfo, "grant account exists", demo.grant);
  const mint = await getMint(conn, new PublicKey(demo.cashrulesMint), "confirmed", TOKEN_2022_PROGRAM_ID);
  const vault = await getAccount(conn, new PublicKey(demo.vault), "confirmed", new PublicKey(demo.usdcTokenProgram));
  check(mint.supply === vault.amount, "vault USDC equals CashRules supply", `${vault.amount} = ${mint.supply}`);

  // 4. Demo payer has CashRules and SOL for fees
  const alpha = demo.grantees[0].wallet;
  const rcAccount = await conn.getAccountInfo(
    new PublicKey(require("@solana/spl-token").getAssociatedTokenAddressSync(new PublicKey(demo.cashrulesMint), new PublicKey(alpha), false, TOKEN_2022_PROGRAM_ID))
  );
  check(!!rcAccount, "Team Alpha has a CashRules account");
  const sol = await conn.getBalance(new PublicKey(alpha));
  check(sol >= 0.01 * 1e9, "Team Alpha has devnet SOL for fees", `${(sol / 1e9).toFixed(4)} SOL`);

  // 5. Live site
  try {
    const r = await fetch(LIVE);
    const html = await r.text();
    check(r.ok && html.includes("CashRules"), "live app serves CashRules", LIVE);
  } catch (e) {
    check(false, "live app serves CashRules", String(e.message || e));
  }

  console.log(failures === 0 ? "\nAll checks passed. Ready." : `\n${failures} check(s) failed. Fix before the demo.`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("preflight crashed:", e);
  process.exit(1);
});
