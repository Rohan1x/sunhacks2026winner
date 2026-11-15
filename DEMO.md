# CashRules demo runbook

Live app: https://rohan1x.github.io/sunhacks2026winner/app/ (devnet). Target: 3 minutes, then 2 minutes of questions.

## 1. Before the demo (about 10 minutes)

Run the check:

```
node scripts/demo-preflight.js
```

Every line should say PASS. If something fails, fix it before going on.

Phantom (on this computer):
- Testnet Mode on, **Solana Devnet** selected.
- Accounts imported: **Grantee1 TeamA** (Team Alpha, has CashRules and devnet SOL), **Issuer**, and the merchant and casino accounts for reference.
- Grantee1 is the active account when you start.

Browser:
- Tab 1: the Dashboard (`/app/`).
- Tab 2: the Pay page (`/app/pay/`), connected as Grantee1.
- Tab 3: the Issuer page (`/app/issuer/`), not connected yet.
- Pay in Phantom is set to "Approve", not auto-approve.

Dry run once, start to finish, before the real demo.

## 2. The script (3 minutes)

| Time | Show | Say |
|---|---|---|
| 0:00 | Dashboard, demo accounts table | "Grants and per-diems are spent on trust. CashRules puts the rule in the money. The Solana transfer hook checks every transfer, so the chain itself rejects what the policy blocks." |
| 0:25 | Dashboard: supply, vault, backing check | "Every CashRules is backed by USDC in a vault. Supply equals the vault. Anyone can check." |
| 0:45 | Pay tab: connected as Grantee1. Pay **Campus Hardware Store**, 25 | "The grantee pays an approved vendor. Phantom asks me to approve." Approve. Show the green Paid message and the lower daily cap. |
| 1:20 | Pay: merchant **Blocked Casino**, 25, Pay | "Now the same payment to a casino. The category isn't allowed." Approve in Phantom. The chain rejects it: `CategoryBlocked`. Point to the red message and the feed entry. |
| 1:55 | Pay: tick **outside the policy**, type a reason, send the request | "Real life needs exceptions. The grantee explains why. The money goes into escrow, not to the casino." Approve. |
| 2:20 | Switch Phantom to **Issuer**, Issuer tab, connect, **Approve** the request | "The issuer reads the reason and approves. The escrow pays the merchant. Reject would forfeit the funds to the issuer, so the grantee is charged." |
| 2:45 | Dashboard feed | "Every payment, every block, and every decision is on-chain and public. That's the point: the rules are enforced by Solana." |

Close with: "CashRules: money that enforces its own rules. Built on Solana with transfer hooks and Token-2022."

## 3. Questions you might get

- **Can a grantee bypass the rules by sending to a friend?** No. The hook runs on every transfer, so a transfer to a non-approved wallet fails the same way as the casino.
- **Why not just use a smart contract escrow?** The rules attach to the token itself, so every app and wallet that moves it has to pass them. There's nothing to route around.
- **Who can change the rules?** The issuer key. That's a single point of trust. A real version would use a multisig or a governance vote.
- **Is this real USDC?** No, a Token-2022 mock on devnet. The vault logic is the same for real USDC, but it's not tested on that token.
- **Is it audited?** No. It's a hackathon build on devnet only.
- **What's next?** Solana Pay QR for merchants, Blinks for approvals from a chat link, a dedicated RPC, and an audit.

## 4. Fallbacks

- **Phantom won't sign a payment that will fail:** that's Phantom's safety check. Explain it, then run `npx ts-node --transpile-only scripts/demo-activity.ts` from the project folder. It sends one paid and three blocked payments with the demo keys, and the feed shows them.
- **Dashboard is blank:** the public devnet RPC rate-limits. Wait 30 seconds and reload. If it stays blank, show the backup video.
- **Site is down:** run the app locally with `cd web && npx next dev -p 3000` and open http://localhost:3000.
- **Connect says "No Solana wallet found":** reload the page with Phantom unlocked.
- **Everything fails:** play the backup video.

## 5. Record the backup video before you present

Record the whole 3-minute script once, while it works, and keep the file on the computer. Devpost takes the video link.
