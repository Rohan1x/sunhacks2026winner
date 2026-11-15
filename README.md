# RuleCash

**Money that enforces its own rules.** RuleCash is a USDC-backed Solana Token-2022 token with a transfer hook. Grant funds can only be spent at approved merchants and within caps, and the chain itself rejects everything else.

Built at SunHacks 2026.

- 📋 Full build plan: [PLAN.md](PLAN.md)
- 🌐 Network: Solana devnet

## Status

- ✅ Phase 1: transfer hook enforces merchant allowlist, category bitmask, per-tx cap and per-grantee daily cap.
- ✅ Phase 2 (program): USDC vault. `deposit_and_mint` locks USDC and mints RuleCash 1:1. `redeem` lets approved merchants burn RuleCash for USDC. The RuleCash mint authority is the grant PDA, so supply can only grow through the vault.
- ⏳ Not yet: devnet deploy and seed script, app, Solana Pay, Blinks.

Test notes: the mock USDC in tests is Token-2022. Classic-token ATA creation fails on the local Agave 4.x validator, so the classic-token path (`usdc_token_program = Tokenkeg…`) is not exercised by the suite yet.

## Program

| Instruction | Who | Does |
|---|---|---|
| `init_grant` | issuer | Create grant PDA and USDC vault for a Token-2022 mint whose TransferHook points at this program and whose mint authority is the grant PDA |
| `deposit_and_mint` | issuer | Move USDC into the vault and mint the same amount of RuleCash to a grantee |
| `redeem` | approved merchant | Burn RuleCash and receive USDC 1:1 from the vault |
| `set_policy` | issuer | Set category bitmask and daily cap |
| `add_merchant` / `set_merchant` | issuer | Approve merchant, set category, per-tx cap, active flag |
| `init_spend` | anyone (pays rent) | Create per-grantee spend counter |
| `init_extra_account_metas` | issuer | Register extra accounts Token-2022 passes to the hook |
| `transfer_hook` | Token-2022 | Runs on every transfer; reverts if any rule fails |

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
| `/merchant` | merchant (Phantom) | See approval status, redeem RuleCash for USDC |
| `/issuer` | issuer (Phantom) | Add, pause or reactivate merchants, set category policy and daily cap, fund grantees |

Run it against a local validator:

```bash
anchor build
npx ts-node scripts/seed.ts          # writes web/lib/demo.json and scripts/.demo-keys/
npx ts-node scripts/demo-activity.ts # one paid, three blocked transfers for the feed
cd web && npm install && npx next build && npx next start -p 3000
```

Demo state is tied to the validator that was seeded (the local validator runs with `--reset`). If you reset the validator, run seed and rebuild the web app.

Status:
- Dashboard and feed: checked in a browser against the local validator. Funded, redeemed, paid and blocked rows all show.
- Write paths (issuer, merchant, pay): covered headlessly by `scripts/web-smoke.ts`. It runs the same instruction sequence and account maps as the pages: setPolicy, addMerchant, pause and reactivate, fund a new grantee, pay, redeem. It does not exercise the React UI or a browser wallet.
- Browser wallet signing (Phantom) not yet tested end to end.
- Issuer console needs the CLI issuer wallet (`~/.config/solana/id.json`) imported into Phantom. It is not in `scripts/.demo-keys`.
- If Phantom refuses to sign a transaction that fails its own simulation, use `scripts/demo-activity.ts` for the on-stage blocked demo.
- Not yet: Solana Pay QR and Blinks (need a public HTTPS URL), devnet deploy (needs devnet SOL in the deploy wallet).
