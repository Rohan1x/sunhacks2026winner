# CashRules: Build Plan

> **Money that enforces its own rules.**
> Grant funds that can only be spent at approved vendors, enforced by the token itself on Solana.

This plan was first written before any code existed. It has been updated to match the repo as of commit `b234922`. Where the original plan turned out wrong, the change is noted in place. Current status lives in [README.md](README.md). A plain-language explainer exists locally at `docs/CASHRULES-EXPLAINED.md` (not committed).

- **Program (devnet):** `8uuvaV8HNBKFsDp2Dn7CnzaQDV59AebPJfAkzJUUFusC`
- **Live app:** https://rohan1x.github.io/sunhacks2026winner/app/

Status key: **Done**, **In progress**, **Not started**, **Blocked** (waiting on a decision or dependency).

---

## 1. The problem

DAOs, NGOs, universities and companies hand out billions in grants, stipends and per-diems. Once the money is sent, the sender loses all control:

- Grantees spend outside scope, and nobody finds out until a quarterly report.
- Audits are manual, slow and after the fact.
- "Restricted funds" are enforced by trust and paperwork, not by the money itself.

## 2. The solution

**CashRules** is a Token-2022 token, backed 1:1 by USDC, with a **transfer hook** that runs on *every* transfer. If the recipient isn't an approved merchant, or the payment breaks a cap, the transfer fails on-chain. No app can route around it, because the rule lives in the token program.

| Actor | What they do |
|---|---|
| **Issuer** (DAO / NGO) | Deposits USDC, mints CashRules to grantees, sets the rules, approves merchants |
| **Grantee** | Spends CashRules, but only at approved merchants and within caps |
| **Merchant** | Gets paid, redeems CashRules 1:1 for USDC (Solana Pay QR is not built yet) |
| **Public** | Watches a live, transparent spend feed |

**Demo moment:** the grantee pays an approved vendor and it succeeds. The grantee tries to pay a blocked merchant or a random wallet and it is **rejected by the chain**. This already works on devnet with a stand-in wallet (`✓ Paid` / `✗ Blocked on-chain: CategoryBlocked`).

## 3. Why this wins

- **Real problem, real buyers.** Grant misuse is a known pain point, and the product isn't a DeFi clone.
- **Deep Solana-native tech.** Token-2022 transfer hooks are an underused primitive that judges will recognise as non-trivial.
- **It demos well.** One payment goes through and one bounces, and the audience sees enforcement in action.
- **Clear business path.** Transaction fees and SaaS for grant programs, plus per-diems and allowances as follow-on markets.

> Status not recorded in the repo: the planned search of the Colosseum archive and Devpost for "transfer hook grant" / "restricted funds". Whether similar projects exist is unknown. Do it before the pitch.

---

## 4. Architecture

**Changed from the original plan:** the plan had two programs (`cashrules_vault` and `cashrules_hook`) and allowed merging them. We merged them. There is one Anchor program, `cashrules`, which holds both the vault and the hook. The plan also had a Next.js server with API routes; the web app is a static export with no server, which is why Solana Pay and Blinks are not built (see section 7).

```
                ┌──────────────────── Solana devnet ────────────────────────┐
                │  cashrules program  8uuvaV8HNBKF...UUFusC                 │
 Issuer ──USDC──▶   init_grant, set_policy, add_merchant, set_merchant     │
                │   init_spend, init_extra_account_metas                    │
                │   deposit_and_mint: USDC -> vault PDA, mint CashRules 1:1  │
                │   redeem: merchant burns CashRules, receives USDC          │
                │                                                           │
 Grantee ─pay──▶  Token-2022 transfer_checked                               │
                │        │ (CPI, automatic)                                 │
                │        ▼                                                  │
                │   transfer_hook (same program)                            │
                │   approved + active merchant? category allowed?           │
                │   amount <= per-tx cap? daily spend <= daily cap?         │
                │   else revert with a named error                          │
                └───────────────────────────────────────────────────────────┘
                          ▲                                 │
                          │ tx built in browser             │ signatures / logs
                ┌─────────┴───────────────┐       ┌─────────▼──────────┐
                │ Static Next.js app      │       │ Dashboard feed     │
                │ GitHub Pages, no server │       │ paid / blocked /   │
                │ web/lib/actions.ts      │       │ funded / redeemed  │
                └─────────────────────────┘       └────────────────────┘
```

### 4.1 On-chain accounts (PDAs)

| Account | Seeds | Purpose |
|---|---|---|
| `Grant` | `["grant", mint]` | Issuer, USDC mint, vault, category bitmask, daily cap. Also the CashRules mint authority, so supply only grows through the vault |
| `Merchant` | `["merchant", mint, merchant_wallet]` | Category, per-tx cap, active flag |
| `Spend` | `["spend", mint, grantee_wallet]` | Day index and spent-today counter (resets at midnight UTC) |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` | Required by the transfer hook interface |
| USDC vault | owned by the `Grant` PDA | Backing reserve |

Changes from the original plan: `remove_merchant` became `set_merchant` (pause and reactivate through the active flag). The `Spend` counter is created by a separate `init_spend` instruction (anyone can pay the rent), not implicitly at mint time.

### 4.2 Transfer hook

The hook resolves `Grant`, `Merchant` (from the destination token account's owner) and `Spend` (from the source token account's owner) as extra accounts, as originally designed. It checks the `transferring` flag so nobody can call it directly. Errors: `NotApprovedMerchant`, `CategoryBlocked`, `OverTxCap`, `OverDailyCap`, `NotTransferring`, `WrongTransferHookProgram`.

Redemption burns do not invoke the hook. Issuer clawback is not built (stretch goal).

### 4.3 Edge cases

| Risk | Status |
|---|---|
| Grantee sends to a friend's wallet | **Done.** Blocked by the hook; test "blocks a transfer to a non-merchant wallet" |
| Grantee approves a delegate | Delegated transfers still go through the hook by design. No delegate test exists |
| Merchants stuck holding a restricted token | **Done.** `redeem` burns CashRules for USDC 1:1 |
| Unspent funds at grant end | **Not started.** `PermanentDelegate` clawback is a stretch goal |
| Wallets don't resolve hook extra accounts | **Changed.** The original fix was a Solana Pay transaction request built on our server. There is no server. The pay page builds the hook accounts from PDA seeds in the browser instead (the SPL helper fails when the merchant has no CashRules account yet) |
| Blocked transfers leave no state | **Done.** Blocked attempts are sent with `skipPreflight: true`, land as failed transactions, and the feed shows the error name |

---

## 5. Tech stack

| Layer | Planned | Actual |
|---|---|---|
| Program | Anchor 0.30+, two programs | Anchor 0.31.1, one program `cashrules` |
| Token | Token-2022 + TransferHook | Same. `PermanentDelegate` not used |
| Mock USDC | Devnet mint we create | Token-2022 mock in tests and demo. Classic-token USDC path not exercised |
| Client | web3.js, spl-token, anchor | Same (`@solana/web3.js` 1.x, `@solana/spl-token` 0.4, `@coral-xyz/anchor` 0.31) |
| App | Next.js App Router + Tailwind + Wallet Adapter | Next.js 14 static export, plain CSS, minimal injected-wallet connector in `web/lib/wallet.ts` |
| Hosting | Not specified | GitHub Pages via `.github/workflows/pages.yml` |
| Payments | `@solana/pay` transaction requests | **Not built** |
| Social | Blinks / Actions | **Not built** |
| Network | Devnet | Devnet, public RPC `api.devnet.solana.com` |
| Tests | `anchor test` on local validator | `anchor test` in WSL (15 passing), `scripts/web-smoke.ts` on devnet (passing) |

---

## 6. Repo layout (actual)

```
/programs/cashrules       # the single Anchor program: vault, rules, transfer hook
/tests/cashrules.ts       # Anchor test suite (run in WSL)
/scripts
  seed.ts                # build demo state on any cluster, writes web/lib/demo.json
  demo-activity.ts       # one paid, three blocked transfers for the feed
  web-smoke.ts           # write-path checks using the shared builders
  dev-signer.ts          # local signer on 127.0.0.1:4020 (dev only)
  dev-wallet.js          # stand-in browser wallet that calls the signer
  throttle.ts            # RPC request spacing for the public devnet RPC
  .demo-keys/            # demo keypairs (gitignored)
/web                     # Next.js static export
  app/                   # /, /pay, /merchant, /issuer
  lib/actions.ts         # shared transaction builders
  lib/chain.ts           # chain reads, feed classification
  lib/wallet.ts          # injected wallet connector
/docs/CASHRULES-EXPLAINED.md  # local explainer, not committed
/.github/workflows/pages.yml
```

Changed from the original: no `/app/api/pay` or `/app/api/actions`, because there is no server.

---

## 7. Status and remaining work

The original 24-hour hour-by-hour timeline is retired. The project did not follow it, and the submission deadline is not recorded in this repo (unknown). What follows is what exists and what is left, in order.

### 7.1 What is done

| Original phase | Status | Notes |
|---|---|---|
| 0. Setup | **Done** | Anchor 0.31.1. Local validator only runs in WSL |
| 1. Hook works | **Done** | Merchant allowlist, category, per-tx cap, daily cap |
| 2. Full rules + vault | **Done** | All instructions; 15 tests pass; deployed and seeded on devnet |
| 3. App | **Done, partly verified** | Four pages live on GitHub Pages. Verified with the stand-in wallet, not with Phantom. Merchant page has no QR |
| 4. Wow layer | **Not started** | Blinks and stats page not built |
| 5. Ship | **In progress** | README written, explainer drafted locally. No demo video, deck or rehearsal recorded in the repo |

### 7.2 Remaining milestones (in order)

| # | Milestone | Owner | Definition of done |
|---|---|---|---|
| 1 | Real Phantom end to end | User installs Phantom and imports keys; assistant fixes bugs found | On the live Pages site with Phantom on devnet: pay succeeds, a blocked pay shows in the feed (or the fallback is confirmed), merchant redeems, issuer funds a grantee |
| 2 | Decide the blocked-pay path | User decides, assistant implements | We know whether Phantom signs a tx it simulates as failing. If not, the demo uses `scripts/demo-activity.ts` for the block and the script is rehearsed |
| 3 | Dedicated RPC | User creates the provider account and key; assistant wires it | `NEXT_PUBLIC_RPC_URL` in `pages.yml` points at a dedicated devnet RPC; the dashboard loads repeatedly without 429s. Provider not chosen yet |
| 4 | Solana Pay QR (**Blocked**) | Assistant | Needs a decision first: (a) a small hosted HTTPS endpoint for transaction requests (host not chosen, adds a server), or (b) a plain transfer-request URL, which only works if the wallet resolves hook extra accounts (unknown, needs testing). Done when a phone wallet scans the merchant QR and pays on devnet |
| 5 | Blinks / actions.json (**Blocked**) | Assistant | Depends on the endpoint from milestone 4. Done when "Approve merchant" or "Fund grantee" runs from the Dialect Blinks inspector on devnet. Can be cut |
| 6 | Stats page | Assistant | Static page showing total granted, total spent by category, blocked count, read from chain |
| 7 | Demo rehearsal + backup video | User | Section 9 script run three times on the live site; a recorded backup video exists |
| 8 | Deck + submission | User, assistant drafts | 5-slide deck, README final, submitted before the deadline (deadline unknown) |

Milestones 1 to 3 matter most: they make the existing demo reliable. 4 to 6 add features and can be cut if time runs out. Feature freeze happens before milestone 7.

---

## 8. Team split

**Changed from the original plan.** The plan assumed three people (programs, client/API, frontend + pitch). In practice the project is built by one person with an AI assistant.

| Who | Owns |
|---|---|
| **User** | Decisions, anything needing accounts or keys (Phantom, RPC provider, GitHub settings), real-wallet testing, rehearsal, pitch, submission |
| **AI assistant** | Program and tests, transaction builders, web app, scripts, docs, fixes from user testing |

The assistant cannot install browser extensions, hold the user's keys, or create third-party accounts.

---

## 9. Demo script (3 minutes)

Uses the seeded devnet state (grantee1, Pizza Co, Hardware Store, a blocked-category casino).

1. **Hook (20s).** "Once you send grant money, you lose control. What if the money enforced the rules itself?"
2. **Issuer (40s).** On `/issuer`: show the policy, approve or pause a merchant, fund a grantee.
3. **Success (30s).** On `/pay`: the grantee pays Pizza Co and `✓ Paid` appears in the dashboard feed. (Original plan: merchant QR scan. Not built.)
4. **The block (40s).** The grantee pays the casino and gets `CategoryBlocked` on-chain; a payment over the Hardware Store's per-tx cap gets `OverTxCap` (both are in `demo-activity.ts`; only `CategoryBlocked` has been seen from the web page so far). If Phantom refuses to sign, run `scripts/demo-activity.ts` instead. *Pause for effect.*
5. **Redeem (20s).** On `/merchant`: the merchant redeems for USDC 1:1, so there's no lock-in.
6. **Blink (15s).** Only if milestone 5 ships. Otherwise cut and give the time to the block.
7. **Close (15s).** "Rules in the money, not in the paperwork. Grants today, per-diems and allowances tomorrow."

---

## 10. Pitch deck (5 slides; no deck in the repo, status otherwise unknown)

1. Problem: restricted funds are enforced by trust.
2. Solution: CashRules, with one-line architecture.
3. Live demo.
4. Why Solana: transfer hooks, sub-cent fees. Mention Solana Pay and Blinks only if they ship.
5. Market + next steps: grant platforms, per-diems, allowances; real USDC, multisig issuer, audit, then mainnet.

---

## 11. Rules for ourselves

- **Devnet only.** This now applies to a live deployment: the program and the public site run on devnet. Never put real funds or mainnet keys in this repo. Demo keys stay in gitignored `scripts/.demo-keys/`.
- The dev signer and dev wallet are for local testing only. Never deploy or expose `dev-signer.ts`.
- Tests come before UI. If `anchor test` (in WSL) is red, nothing else matters.
- After any program change: redeploy, re-seed, rebuild the web app, rerun `web-smoke.ts`.
- Make small commits and keep `main` demoable; a push touching `web/` redeploys the live site.
- No new features after feature freeze.

---

## 12. Risks and decisions

| Risk / decision | Current position |
|---|---|
| Public devnet RPC rate limits (HTTP 429) | Browser and scripts hit limits. Dashboard polls every 60s and reads 10 feed items; scripts can space requests with `RPC_THROTTLE_MS`. A dedicated RPC is still needed (milestone 3) |
| Mock USDC vs real USDC | Demo and tests use a Token-2022 mock. Real USDC is a classic-token mint; that path is untested because classic ATA creation failed on the Agave 4.x local validator. Must be tested before claiming real-USDC support |
| Single issuer key | One key can change policy, approve merchants and mint against the vault. Fine for a demo; real use needs a multisig or governance. Program upgrade authority is also a single key |
| Phantom simulation behaviour | Phantom may warn on or refuse to sign a tx it simulates as failing. Unconfirmed. Fallback: `demo-activity.ts` sends blocked transfers without a wallet |
| Blocked payments rely on `skipPreflight` | Needed so failed transfers land on-chain and show in the feed. They cost a fee |
| WSL needed for tests | `solana-test-validator` needs symlink privilege on Windows (os error 1314). Run `anchor test` in WSL |
| GitHub Pages source | Pages must use **GitHub Actions** as its source (Settings, Pages). Done for this repo; a fork or new repo needs it set again |
| No server | The static export keeps hosting simple but blocks Solana Pay transaction requests and Blinks until we add an endpoint |
| Not audited | No security review. Don't use with real funds |

---

## 13. Stretch goals (only after milestones 1 to 3)

- `PermanentDelegate` clawback when the grant expires.
- Time-boxed grants (the hook rejects transfers after `expires_at`).
- Per-grantee policies (different caps per team).
- Merchant self-registration with issuer approval via Blink.
- Real USDC (classic token) path, tested on devnet.
- Confidential amounts (Token-2022 confidential transfers). Hard; last.
