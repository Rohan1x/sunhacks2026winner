# RuleCash

**Money that enforces its own rules.** RuleCash is a USDC-backed Solana Token-2022 token with a transfer hook. Grant funds can only be spent at approved merchants and within caps, and the chain itself rejects everything else.

Built at SunHacks 2026.

- 📋 Full build plan: [PLAN.md](PLAN.md)
- 🌐 Network: Solana devnet

## Status

- ✅ Phase 1–2 (program): `rulecash` Anchor program. Transfer hook enforces merchant allowlist, category bitmask, per-tx cap and per-grantee daily cap. Grant/merchant admin instructions included.
- ⏳ Not yet: USDC vault (`deposit_and_mint` / `redeem`), app, Solana Pay, Blinks.

## Program

| Instruction | Who | Does |
|---|---|---|
| `init_grant` | issuer | Create grant PDA for a Token-2022 mint whose TransferHook points at this program |
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
