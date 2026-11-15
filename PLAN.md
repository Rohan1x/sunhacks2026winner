# RuleCash — Build Plan

> **Money that enforces its own rules.**
> Grant funds that can only be spent at approved vendors, enforced by the token itself on Solana.

---

## 1. The problem

DAOs, NGOs, universities and companies hand out billions in grants, stipends and per-diems. Once the money is sent, the sender loses all control:

- Grantees spend outside scope, and nobody finds out until a quarterly report.
- Audits are manual, slow and after the fact.
- "Restricted funds" are enforced by trust and paperwork, not by the money itself.

## 2. The solution

**RuleCash** is a Token-2022 token, backed 1:1 by USDC, with a **transfer hook** that runs on *every* transfer. If the recipient isn't an approved merchant, or the payment breaks a cap, the transfer fails on-chain. No app can route around it, because the rule lives in the token program.

| Actor | What they do |
|---|---|
| **Issuer** (DAO / NGO) | Deposits USDC, mints RuleCash to grantees, sets the rules, approves merchants |
| **Grantee** | Spends RuleCash, but only at approved merchants and within caps |
| **Merchant** | Gets paid via Solana Pay QR, redeems RuleCash 1:1 for USDC |
| **Public** | Watches a live, transparent spend feed |

**Demo moment:** the grantee pays an approved vendor and it succeeds. The grantee tries to pay a random wallet and it is **rejected by the chain**, live on stage.

## 3. Why this wins

- **Real problem, real buyers.** Grant misuse is a known pain point, and the product isn't a DeFi clone.
- **Deep Solana-native tech.** It uses Token-2022 transfer hooks, an underused primitive that judges will recognise as non-trivial.
- **It demos well.** One payment goes through and one bounces, and the audience sees enforcement in action.
- **Clear business path.** Transaction fees and SaaS for grant programs, plus per-diems and allowances as follow-on markets.

> Before committing, search the Colosseum project archive and Devpost for "transfer hook grant" / "restricted funds" so we can explain how we differ from anything similar.

---

## 4. Architecture

```
                ┌──────────────────────── Solana (devnet) ───────────────────────┐
                │                                                                │
 Issuer ──USDC──▶  rulecash_vault program                                        │
                │   • init_grant: creates Token-2022 mint (TransferHook ext)     │
                │   • deposit_and_mint: USDC → vault PDA, mint RuleCash 1:1      │
                │   • add_merchant / remove_merchant / set_policy               │
                │   • redeem: merchant burns RuleCash, receives USDC             │
                │                                                                │
 Grantee ─pay──▶  Token-2022 transfer_checked                                    │
                │        │                                                       │
                │        ▼ (CPI, automatic)                                       │
                │  rulecash_hook program  (spl-transfer-hook-interface Execute)   │
                │   • is destination owner an approved merchant?  else ✗         │
                │   • amount ≤ merchant per-tx cap?               else ✗         │
                │   • grantee daily spend + amount ≤ daily cap?   else ✗         │
                │   • update grantee spend counter                               │
                └────────────────────────────────────────────────────────────────┘
                          ▲                                   │
                          │ tx build (resolves extra accounts)│ logs / signatures
                ┌─────────┴──────────┐              ┌─────────▼─────────┐
                │ Next.js app + API  │              │ Live spend feed   │
                │ • Issuer console   │              │ ✓ paid  ✗ blocked │
                │ • Solana Pay (tx   │              └───────────────────┘
                │   request) endpoint│
                │ • Blinks (Actions) │
                └────────────────────┘
```

We could merge both programs into one. We keep them separate because the hook program's `Execute` interface is strict, so isolating it keeps it small and auditable.

### 4.1 On-chain accounts (PDAs)

| Account | Seeds | Fields |
|---|---|---|
| `Grant` | `["grant", mint]` | issuer, usdc_mint, vault, allowed_categories (u32 bitmask), daily_cap (u64), bump |
| `Merchant` | `["merchant", mint, merchant_wallet]` | category (u8), per_tx_cap (u64), active (bool), bump |
| `Spend` | `["spend", mint, grantee_wallet]` | day_index (i64), spent_today (u64), bump |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` | required by the transfer hook interface |
| USDC vault | ATA of `Grant` PDA for USDC | backing reserve |

### 4.2 Transfer hook: how the extra accounts resolve

On every `transfer_checked`, Token-2022 passes the hook these accounts: `[0] source token acct, [1] mint, [2] destination token acct, [3] owner, [4] ExtraAccountMetaList`, then our extras:

| # | Account | How it is derived |
|---|---|---|
| 5 | `Grant` | seeds `["grant", mint]` (account index 1) |
| 6 | `Merchant` | seeds `["merchant", mint, AccountData(index 2, offset 32, len 32)]`, i.e. the **owner field of the destination token account** |
| 7 | `Spend` (writable) | seeds `["spend", mint, AccountData(index 0, offset 32, len 32)]`, i.e. the **owner of the source token account** |

The hook also performs these checks:

- **Check the `transferring` flag** on the source account's `TransferHookAccount` extension. Without it, anyone could call `Execute` directly and corrupt spend counters.
- If the `Merchant` PDA is uninitialized or inactive, return `NotApprovedMerchant`.
- If `amount > per_tx_cap`, return `OverTxCap`. If the merchant category is not in the allowed bitmask, return `CategoryBlocked`.
- If the day index has rolled over (`Clock::unix_timestamp / 86400`), reset the counter. If the new total exceeds `daily_cap`, return `OverDailyCap`.

Two transfers skip the rules: **redemption burns** (burns don't invoke the hook) and **issuer clawback**, which goes through the vault program.

### 4.3 Edge cases we must handle

| Risk | Mitigation |
|---|---|
| The grantee sends to a friend's wallet, who spends it | The hook runs on *every* transfer, so the friend's wallet isn't a merchant and the transfer is blocked. |
| The grantee approves a delegate | Delegated transfers still go through `transfer_checked` and the hook. |
| The `Spend` PDA doesn't exist for a new grantee | `deposit_and_mint` creates it at mint time. |
| Merchants are stuck holding a restricted token | `redeem` burns RuleCash and releases USDC 1:1 from the vault. |
| A grant ends with unspent funds | Stretch goal: the `PermanentDelegate` extension lets the issuer claw back funds. |
| Wallets don't resolve transfer-hook extra accounts | **Use a Solana Pay *transaction request*.** Our server builds the transaction with `createTransferCheckedWithTransferHookInstruction` (`@solana/spl-token`), which resolves the extras, and the wallet only signs. This avoids relying on wallet support. |
| Blocked transfers revert, so they leave no on-chain state | Blocked attempts are still **failed transactions** on-chain (fee paid). We send them with `skipPreflight: true` and read errors via `getSignaturesForAddress`, which surfaces them in the feed with the custom error name. |

---

## 5. Tech stack

| Layer | Choice |
|---|---|
| Programs | Rust, **Anchor ≥ 0.30** (needed for `#[interface(spl_transfer_hook_interface::execute)]`), `spl-tlv-account-resolution`, `spl-transfer-hook-interface` |
| Token | SPL **Token-2022** with the `TransferHook` extension (`PermanentDelegate` is a stretch goal) |
| Client | TypeScript, `@solana/web3.js`, `@solana/spl-token`, `@coral-xyz/anchor` |
| App | Next.js (App Router) + Tailwind + Solana Wallet Adapter |
| Payments | `@solana/pay` transaction requests (QR) |
| Social | Solana Actions / Blinks for "Approve merchant" and "Fund grantee" |
| Network | **Devnet only.** Use a devnet USDC-like mint we create ourselves. |
| Tests | `anchor test` (TS, local validator) |

Pin exact versions in `Anchor.toml` / `package.json` at setup, and confirm Anchor, Solana CLI and `spl-*` crate versions are mutually compatible **before** writing code.

---

## 6. Repo layout

```
/programs
  /rulecash_vault      # grant, mint, merchants, redeem
  /rulecash_hook       # transfer hook Execute + extra metas init
/tests                 # anchor TS tests (the source of truth)
/app                   # Next.js: issuer console, pay page, feed, actions API
  /app/api/pay         # Solana Pay transaction request endpoint
  /app/api/actions     # Blinks endpoints + actions.json
/scripts               # devnet setup: create USDC mock, seed grant, merchants
PLAN.md
README.md
```

---

## 7. Timeline (24h, adjust if longer)

The phases are ordered so that **something demoable exists as early as possible**.

### Phase 0: Setup (H0–H1)
- [ ] Install toolchain (Solana CLI, Anchor, Node 20+, Rust). Verify that `anchor --version` works for everyone.
- [ ] `anchor init`, add both programs, scaffold the Next.js app.
- [ ] Set up a funded devnet wallet and create the mock USDC mint.

### Phase 1: The hook works (H1–H6). Highest risk, so it goes first.
- [ ] `rulecash_hook`: `initialize_extra_account_meta_list` + `execute` with **only** the merchant allowlist check.
- [ ] Test: transfer to a merchant passes, and transfer to a random wallet fails with `NotApprovedMerchant`.
- **Gate:** don't move on until this test is green. This is the whole project.

### Phase 2: Full rules + vault (H6–H11)
- [ ] `Grant`, `Merchant`, `Spend` PDAs. Add the per-tx cap, category bitmask, daily cap and `transferring` flag checks.
- [ ] `rulecash_vault`: `init_grant`, `deposit_and_mint`, `add_merchant`, `remove_merchant`, `set_policy`, `redeem`.
- [ ] Tests for every error path, plus the redeem round-trip (USDC in = USDC out).
- [ ] Deploy to devnet. Run the `scripts/seed.ts` demo state.

### Phase 3: App (H11–H17)
- [ ] Issuer console: create grant, fund grantee, add/remove merchants, edit caps.
- [ ] Grantee page: balance, remaining daily cap, "Pay" button.
- [ ] Merchant page: Solana Pay QR (transaction request) and Redeem button.
- [ ] Live feed: ✓ successful payments and ✗ blocked attempts with error reason.

### Phase 4: Wow layer (H17–H20)
- [ ] Blinks: "Approve merchant" and "Fund grantee $X" actions (test in the Dialect Blinks inspector, since X/Twitter unfurling needs registry approval).
- [ ] Public transparency page: total granted, total spent by category, blocked count.

### Phase 5: Ship (H20–H24)
- [ ] **Feature freeze at H20.** After that, only bug fixes are allowed.
- [ ] README with a one-line pitch, architecture diagram, program IDs and run steps.
- [ ] Record a **backup demo video** (wifi will betray us).
- [ ] Build the pitch deck (5 slides) and rehearse the demo three times.
- [ ] Submit early. Don't submit at H23:59.

---

## 8. Team split

| Role | Owns |
|---|---|
| **A: Programs** | Hook + vault programs, Anchor tests, devnet deploy |
| **B: Client/API** | Tx builders, Solana Pay endpoint, Blinks endpoints, feed indexer |
| **C: Frontend + pitch** | Next.js pages, UI, deck, demo video, README |

Sync points: the IDL is frozen at H11, and from then on A only changes program internals, not interfaces.

---

## 9. Demo script (3 minutes)

1. **Hook (20s).** "Last year, $X in grants was misused. Once you send money, you lose control. What if the money enforced the rules itself?"
2. **Issuer (40s).** Create grant, fund a student hackathon team with 500 RuleCash, approve "Campus Hardware Store" (category: hardware, $200 per-tx cap).
3. **Success (30s).** The grantee scans the merchant QR, pays $50, and the ✓ appears in the live feed.
4. **The block (40s).** The grantee tries to send $50 to a random wallet. **Rejected on-chain** with `NotApprovedMerchant`. They then try $300 at the store and get `OverTxCap`. *Pause for effect.*
5. **Redeem (20s).** The merchant redeems for USDC 1:1, so there's no lock-in for vendors.
6. **Blink (15s).** The issuer approves a new merchant from a link in a chat.
7. **Close (15s).** "Rules in the money, not in the paperwork. Grants today, per-diems and allowances tomorrow."

---

## 10. Pitch deck (5 slides)

1. Problem: restricted funds are enforced by trust.
2. Solution: RuleCash, with one-line architecture.
3. Live demo.
4. Why Solana: transfer hooks, sub-cent fees, Solana Pay, Blinks.
5. Market + next steps: grant platforms, corporate per-diems, allowances, mainnet with audited programs.

---

## 11. Rules for ourselves (avoid the classic mistakes)

- **Devnet only.** Never put real funds or mainnet keys in this repo. Keep `.env` and keypairs in `.gitignore` from commit one.
- Tests come before UI. If `anchor test` is red, nothing else matters.
- Get the extra-account-meta setup right first, because it is the #1 transfer-hook time sink.
- Make small commits with clear messages and keep `main` always demoable.
- No scope creep before H20. Stretch goals live in section 12 and stay there.

## 12. Stretch goals (only if ahead of schedule)

- `PermanentDelegate` clawback when the grant expires.
- Time-boxed grants (the hook rejects transfers after `expires_at`).
- Per-grantee policies (different caps per team).
- Merchant self-registration with issuer approval via Blink.
- Confidential amounts (Token-2022 confidential transfers). This is hard, so only attempt it if everything else is done.
