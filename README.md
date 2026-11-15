# CashRules

**Money that enforces its own rules.** CashRules is a USDC-backed Solana Token-2022 token with a transfer hook. Grant funds can only be spent at approved merchants and within caps, and the chain itself rejects everything else.

Built at SunHacks 2026.

- 📋 Full build plan: [PLAN.md](PLAN.md)
- 🌐 Network: Solana devnet (program `8uuvaV8HNBKFsDp2Dn7CnzaQDV59AebPJfAkzJUUFusC`)
- 🖥️ Live app: https://rohan1x.github.io/sunhacks2026winner/

## Status

- ✅ Phase 1: transfer hook enforces merchant allowlist, category bitmask, per-tx cap and per-grantee daily cap.
- ✅ Phase 2 (program): USDC vault. `deposit_and_mint` locks USDC and mints CashRules 1:1. `redeem` lets approved merchants burn CashRules for USDC. The CashRules mint authority is the grant PDA, so supply can only grow through the vault.
- ✅ Deployed to devnet and seeded. Smoke test passes on devnet.
- ✅ Web app: dashboard, pay, merchant and issuer pages. Static export, deployed by GitHub Actions to GitHub Pages. Live dashboard and pay page confirmed.
- ✅ Wallet flow verified in the browser with a stand-in wallet (see "Testing without Phantom"): pay, blocked pay, merchant redeem, issuer fund.
- ⏳ Not yet verified: a real Phantom wallet end to end (see "Using Phantom").
- ⏳ Not yet built: Solana Pay QR, Blinks, stats page.

Test notes: the mock USDC in tests is Token-2022. Classic-token ATA creation fails on the local Agave 4.x validator, so the classic-token path (`usdc_token_program = Tokenkeg…`) is not exercised by the suite yet.

## Program

| Instruction | Who | Does |
|---|---|---|
| `init_grant` | issuer | Create grant PDA and USDC vault for a Token-2022 mint whose TransferHook points at this program and whose mint authority is the grant PDA |
| `deposit_and_mint` | issuer | Move USDC into the vault and mint the same amount of CashRules to a grantee |
| `redeem` | approved merchant | Burn CashRules and receive USDC 1:1 from the vault |
| `set_policy` | issuer | Set category bitmask and daily cap |
| `add_merchant` / `set_merchant` | issuer | Approve merchant, set category, per-tx cap, active flag |
| `init_spend` | anyone (pays rent) | Create per-grantee spend counter |
| `init_extra_account_metas` | issuer | Register extra accounts Token-2022 passes to the hook |
| `transfer_hook` | Token-2022 | Runs on every transfer; reverts if any rule fails |
| `set_exception_escrow` | issuer | Choose the issuer-owned CashRules account that holds out-of-policy payments |
| `request_exception` | payer | Record an out-of-policy payment with a reason (the payer's funds go to escrow in the same transaction) |
| `approve_exception` | issuer | Mark a request approved; the escrowed funds are paid to the merchant in the same transaction |
| `reject_exception` | issuer | Mark a request rejected; the escrowed funds stay with the issuer, so the payer is charged |

Error names (`NotApprovedMerchant`, `CategoryBlocked`, `OverTxCap`, `OverDailyCap`, `NotTransferring`, `WrongTransferHookProgram`) show up in failed-transaction logs.

## Running tests

Requirements: Solana CLI 2.x+/Agave, Anchor CLI 0.31.1, Node 20+, Rust stable.

```bash
npm install
anchor build
anchor test
```

**Windows:** `solana-test-validator` needs symlink privilege (os error 1314) and won't start from a normal Windows shell. Run `anchor test` inside WSL (Ubuntu) instead.

## Web app (`web/`)

| Page | Who | Does |
|---|---|---|
| `/` | anyone | Grant state, backing check, merchants, live spend feed (paid, blocked with on-chain error name, funded, redeemed) |
| `/pay` | grantee (Phantom) | Pay an approved merchant. Shows daily cap left. Rejections land on-chain and show in the feed |
| `/merchant` | merchant (Phantom) | See approval status, redeem CashRules for USDC |
| `/issuer` | issuer (Phantom) | Add, pause or reactivate merchants, set category policy and daily cap, fund grantees |

Run it against a local validator:

```bash
anchor build
npx ts-node scripts/seed.ts          # writes web/lib/demo.json and scripts/.demo-keys/
npx ts-node scripts/demo-activity.ts # one paid, three blocked transfers for the feed
cd web && npm install && npx next dev -p 3000
# or: npx next build   (writes a static site to web/out)
```

Demo state is tied to the validator that was seeded (the local validator runs with `--reset`). If you reset the validator, run seed and rebuild the web app.

### Notes on the write paths

- Transaction builders live in `web/lib/actions.ts`. The pages and `scripts/web-smoke.ts` share them. The smoke test covers setPolicy, addMerchant, pause and reactivate, fund a new grantee, pay to a merchant with no CashRules account yet, and redeem. It does not exercise the React UI or a browser wallet.
- The pay transaction builds the transfer hook accounts from PDA seeds. The SPL helper reads the destination account at build time, which fails when the merchant has no CashRules account yet.
- The issuer console only shows write controls when the connected wallet is the grant issuer (`~/.config/solana/id.json` for the devnet deploy). Import that key into Phantom to use it.
- If Phantom refuses to sign a transaction that fails its own simulation, use `scripts/demo-activity.ts` for the on-stage blocked demo. Not confirmed against real Phantom yet.

## Exceptions (out-of-policy payments)

A payer can ask for a payment the policy would block, such as a vendor outside the approved categories. The request needs a reason.

1. **Request.** The payer's CashRules move into the issuer's escrow account and the request (with its reason) is recorded. Both happen in one transaction, so either both succeed or neither does.
2. **Decision.** The issuer reviews the request in the issuer console.
   - **Approve:** the escrowed amount is paid to the merchant, in the same transaction as the decision.
   - **Reject:** the escrowed amount stays with the issuer, and the payer is charged for it.

Why the transfers are split out: a Token-2022 transfer can't trigger this program's own transfer hook from inside the program, so the transfers run at the top level of each transaction. Exception amounts do not count toward the daily cap.

Limits: the escrow account is the issuer's own account, so the issuer controls the funds. A payer who transfers CashRules straight into the escrow account (without a request) can't get them back.

## Using Phantom

Phantom is a browser extension that holds your keys. The site never sees them.

**Install (one-time):**
1. Open the Phantom listing in the Chrome Web Store: https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa
2. Check the publisher is Phantom, then click **Add to Chrome**.
3. Open Phantom and create a wallet, writing down the recovery phrase on paper. Or import an existing key.
4. In Phantom's settings, switch the network to **Devnet**. The app runs on devnet, so a mainnet wallet won't work.

**Get devnet SOL** (needed for fees) from a devnet faucet, such as https://faucet.solana.com.

**Import a demo key** (optional, for testing as a grantee or merchant): the demo keys are in `scripts/.demo-keys/` (gitignored). Import one through Phantom's import screen. Keep the file private. Don't paste the key anywhere else.

**How sign-in works:**
- There's no site login or password. Clicking **Connect** asks Phantom to share your public address with the site. You approve in a popup. The site gets your address only.
- Each action (a payment, a redeem, an issuer change) asks Phantom to sign that transaction. Phantom shows the amount, recipient and fee. You approve, and Phantom signs inside the extension. The site then sends the signed transaction.
- The pages only show the buttons that match your role. The issuer console checks that the connected address is the grant issuer.

## GitHub Pages

The web app is a static export. `.github/workflows/pages.yml` builds it with `BASE_PATH=/sunhacks2026winner` and `NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com`, then publishes `web/out`.

One-time setup (done): in the repo, Settings → Pages → Build and deployment → Source: **GitHub Actions**. Pushes to `main` that touch `web/` redeploy.

Live URL: https://rohan1x.github.io/sunhacks2026winner/

Notes:
- The browser talks to devnet directly, so the public devnet RPC rate limits apply. Under load the dashboard can go blank. Use a dedicated RPC by changing `NEXT_PUBLIC_RPC_URL` in the workflow.
- Wallet features need Phantom in the browser. The dashboard works without one.

## Testing without Phantom

`scripts/dev-signer.ts` runs locally on 127.0.0.1:4020 and signs with the demo keys. `scripts/dev-wallet.js` provides a stand-in wallet for the browser (`useDevWallet("grantee1")` in the console, then click Connect). Dev only. No private key enters the page.

Verified this way against devnet:
- Pay Pizza Co (allowed): `✓ Paid`. Also confirmed on the live GitHub Pages site.
- Pay the casino (blocked category): `✗ Blocked on-chain: CategoryBlocked`. Local build only.
- Merchant redeems CashRules for USDC. Local build only.
- Issuer funds a grantee. Local build only.
