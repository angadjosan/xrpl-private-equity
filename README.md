# XRPL Private Equity Protocol

Tokenize private company shares on the XRP Ledger. Issue equity as Multi-Purpose Tokens, custody shares in Token Escrow, verify ownership with on-chain credentials, distribute cashflows to holders, and trade on the native DEX — all without a backend.

> **Built for the Ripple Track hackathon.** Runs entirely on XRPL Devnet. No backend, no database — every operation is an on-chain transaction.

---

## Demo

| App | URL | Purpose |
|-----|-----|---------|
| **Equity Protocol** | `http://localhost:3000` | Issue tokens, register shareholders, verify ownership, distribute cashflows |
| **PE Trading Terminal** | `http://localhost:3001` | Portfolio dashboard, DEX trading, leverage via Vaults & Loan Brokers |

Both apps connect to **XRPL Devnet** (`wss://s.devnet.rippletest.net:51233`) and fund wallets automatically from the devnet faucet. No configuration needed.

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/angadsinghjosan/xrpl-private-equity.git
cd xrpl-private-equity

# Install dependencies
npm install
cd pe-trading && npm install && cd ..

# Start both apps
npm run dev                          # Equity Protocol → localhost:3000
cd pe-trading && npm run dev         # Trading Terminal → localhost:3001
```

**Requirements:** Node.js >= 18, npm >= 8

**Run tests:**
```bash
npm test                             # Unit tests (flags, metadata, escrow crypto)
npm run test:integration             # End-to-end devnet integration test
```

---

## What It Does

### The Problem

Private equity is illiquid by design. Shareholders are locked into positions for years with no standardized way to transfer ownership, verify holdings, receive distributions, or trade shares. Existing infrastructure is fragmented and expensive.

### The Solution

A protocol that represents private company shares as **Multi-Purpose Tokens (MPTs)** on the XRP Ledger. Each MPT = 1 share. The protocol handles the full lifecycle:

```
Issue shares → Custody in escrow → Verify ownership → Distribute cashflows → Trade on DEX
```

Every step is an on-chain transaction. Compliance is enforced at the protocol level — only issuer-authorized wallets can hold equity tokens.

---

## XRPL Amendments Used

This project uses **6 XRPL standards** — all active on Devnet:

| Standard | Amendment | What We Use It For |
|----------|-----------|-------------------|
| **XLS-33** | Multi-Purpose Tokens | Equity token issuance with 6 configurable flags |
| **XLS-85** | Token Escrow | Custody shares with crypto-conditions + time locks |
| **XLS-70** | Credentials | On-chain verifier attestations for share ownership |
| **XLS-89** | Token Metadata | Company info, share class, proof of ownership stored on-chain |
| **XLS-65** | Single Asset Vault | XRP liquidity vault for leveraged trading |
| **XLS-66** | Loan Broker | Collateralized lending against equity positions |

---

## Architecture

### Account Roles

```
Issuer Account ─── Creates MPT, authorizes holders, locks/unlocks, claws back
    │
    ├── Payment (all shares) ──→ Protocol Account ─── Holds MPTs, creates escrows,
    │                                                   distributes cashflows, makes markets
    │
    └── MPTokenAuthorize ──→ Shareholder Accounts ─── Hold tokens, trade on DEX,
                                                        receive distributions
```

The issuer and protocol accounts are separated because **XRPL prohibits the token issuer from being the escrow source** (XLS-85 constraint).

### Transaction Flows

**1. Issue Equity Token**
```
MPTokenIssuanceCreate → MPTokenAuthorize (protocol) → Payment (shares to protocol)
```

**2. Register Shareholder**
```
Generate SHA-256 document hash → MPTokenAuthorize (holder) → EscrowCreate (with crypto-condition + FinishAfter)
```

**3. Verify & Release**
```
Verifier stakes XRP → CredentialCreate → EscrowFinish (with fulfillment)
```

**4. Distribute Cashflow**
```
Query all MPT holders → Calculate pro-rata amounts → Sequential IOU Payments
```

**5. Trade on DEX**
```
OfferCreate (buy/sell MPT for XRP) → NAV Oracle updates bid/ask spread
```

---

## Features

### Equity Protocol (localhost:3000)

| Feature | Description | XRPL Transactions |
|---------|-------------|-------------------|
| **Token Issuance** | Create equity MPT with company metadata, share structure, compliance flags | `MPTokenIssuanceCreate` |
| **6 Configurable Flags** | Transfer, Escrow, Trade, Auth, Lock, Clawback — with dependency validation | Immutable after creation |
| **XLS-89 Metadata** | Company name, entity type, jurisdiction, share class, proof of ownership — all on-chain (1024 byte limit) | Hex-encoded in `MPTokenMetadata` |
| **Share Registration** | Document signing, SHA-256 hashing, proof upload | `MPTokenAuthorize`, `EscrowCreate` |
| **Token Escrow** | PREIMAGE-SHA-256 crypto-conditions with FinishAfter maturity + CancelAfter expiry | `EscrowCreate`, `EscrowFinish`, `EscrowCancel` |
| **Verifier Staking** | Verifiers stake XRP, review registrations, issue on-chain credentials | `CredentialCreate`, `CredentialAccept` |
| **Cashflow Distribution** | Pro-rata IOU payments to all holders based on MPT balances | `Payment` (IOU format) |
| **NAV Oracle** | Bridge external fund P&L to XRPL DEX pricing with bid/ask spread | `OfferCreate`, `OfferCancel` |
| **Lock/Unlock** | Freeze tokens globally or per-holder | `MPTokenIssuanceSet` |
| **Clawback** | Issuer recovers tokens from any holder | `Clawback` |

### PE Trading Terminal (localhost:3001)

| Feature | Description | XRPL Transactions |
|---------|-------------|-------------------|
| **Auto-Bootstrap** | Funds 3 wallets, creates 2 equity tokens, deploys vault + loan broker, seeds DEX liquidity — all in ~30s | 15+ transactions |
| **Portfolio Dashboard** | Real-time holdings, NAV, XRP balance (CoinGecko price feed) | `account_objects`, `account_info` |
| **DEX Trading** | Buy/sell equity shares for XRP with standing bid/ask orders | `OfferCreate` |
| **XLS-65 Vault** | Single-asset XRP vault for leveraged trading liquidity | `VaultCreate`, `VaultDeposit` |
| **XLS-66 Loan Broker** | Collateralized lending: borrow XRP against vault shares | `LoanBrokerCreate`, `LoanCreate` |

---

## MPT Flag System

All 6 Multi-Purpose Token flags are implemented with dependency validation:

```
┌─────────────────────────────────────────────────┐
│  tfMPTCanTransfer (0x20)   ← Required by ↓ ↓   │
│  tfMPTCanEscrow  (0x08)   ← Requires Transfer  │
│  tfMPTCanTrade   (0x10)   ← Requires Transfer  │
│  tfMPTRequireAuth (0x04)  ← Independent         │
│  tfMPTCanLock    (0x02)   ← Independent         │
│  tfMPTCanClawback (0x40)  ← Independent         │
└─────────────────────────────────────────────────┘
```

Disabling Transfer automatically disables Escrow and Trade. The UI enforces this with cascading toggles. All flags are **immutable after token creation**.

---

## On-Chain Metadata (XLS-89)

Every equity token stores structured metadata on-chain:

```json
{
  "t": "ACME",
  "n": "Acme Holdings Inc.",
  "ac": "rwa",
  "as": "equity",
  "d": "Each token represents 1 Class A common share",
  "ai": {
    "entity_type": "C-Corp",
    "jurisdiction": "US-DE",
    "share_class": "Class A Common",
    "proof_type": "cap_table_extract",
    "proof_reference": "SHA256:a1b2c3...",
    "transfer_agent": "Carta",
    "governing_law": "reg_d_506b",
    "cashflow_currency": "USD",
    "distribution_frequency": "quarterly",
    "verification_period_days": "14"
  }
}
```

Compressed key names keep metadata under the 1024-byte limit. The form validates byte size in real-time as users type.

---

## Escrow & Verification Flow

Share registration uses a multi-step verification process:

```
1. Shareholder uploads proof document → SHA-256 hash computed client-side
2. Transfer agreement generated → signed in-browser
3. Shareholder wallet created + authorized (MPTokenAuthorize)
4. MPT escrow created with:
   - PREIMAGE-SHA-256 crypto-condition (random 32-byte preimage)
   - FinishAfter: 1 hour (verifier review period)
   - CancelAfter: 7-90 days (configurable verification deadline)
5. Verifier stakes XRP → reviews documents → issues XLS-70 credential
6. EscrowFinish with fulfillment releases shares to holder
```

If the verifier doesn't approve before `CancelAfter`, anyone can call `EscrowCancel` to return tokens to the protocol account.

---

## Project Structure

```
xrpl-private-equity/
├── src/
│   ├── app/page.tsx                    # Main dashboard (single-page with tab navigation)
│   ├── components/
│   │   ├── CreateForm.tsx              # Token issuance form (4 sections + flags)
│   │   ├── TokenList.tsx               # Browse all devnet equity tokens
│   │   ├── ShareManager.tsx            # Post-creation management hub
│   │   ├── RegisterShares.tsx          # Shareholder registration + escrow
│   │   ├── VerifierDashboard.tsx       # Verifier staking + credential issuance
│   │   ├── CashflowPanel.tsx           # Pro-rata distribution to holders
│   │   ├── NAVSync.tsx                 # NAV oracle → DEX price sync
│   │   ├── EarningsReport.tsx          # Financial reporting + DCF valuation
│   │   └── FinancialsForm.tsx          # Company financials data entry
│   ├── lib/
│   │   ├── xrpl/
│   │   │   ├── client.ts              # Connection manager + submitWithRetry
│   │   │   ├── mpt.ts                 # Create, authorize, lock, unlock, clawback
│   │   │   ├── escrow.ts              # EscrowCreate/Finish/Cancel + crypto-conditions
│   │   │   ├── payments.ts            # MPT transfers + IOU cashflow distribution
│   │   │   ├── queries.ts             # Paginated queries with retry logic
│   │   │   ├── credentials.ts         # XLS-70 credential create/accept/check
│   │   │   └── nav-oracle.ts          # DEX market making at NAV prices
│   │   ├── metadata.ts                # XLS-89 encode/decode/validate
│   │   ├── flags.ts                   # Flag computation + dependency cascading
│   │   ├── constants.ts               # Network config, limits, timing
│   │   └── documents.ts               # Transfer agreement generation + SHA-256
│   ├── context/                        # React Context: XRPL, Wallet, Token
│   ├── hooks/                          # useXRPL, useWallet, useToken, useTransaction
│   └── types/index.ts                  # TypeScript interfaces
│
├── pe-trading/                         # PE Trading Terminal (separate Next.js app)
│   ├── src/
│   │   ├── app/page.tsx                # Portfolio dashboard
│   │   ├── context/WalletContext.tsx    # Auto-bootstrap: wallets → tokens → vault → DEX
│   │   └── lib/xrpl/
│   │       ├── client.ts              # Connection + transaction submission
│   │       ├── trading.ts             # MPT issuance, DEX orders, orderbook queries
│   │       ├── vault.ts               # XLS-65: create, deposit, withdraw, query
│   │       ├── lending.ts             # XLS-66: loan broker, create loan, repay
│   │       └── wallet.ts              # Wallet generation + localStorage persistence
│   └── package.json
│
├── PROGRESS.md                         # Architecture design document
├── TDD.md                              # Full technical specification
└── package.json
```

---

## Testing

```bash
# Run all unit tests
npm test

# Run only unit tests (no devnet required)
npm run test:unit

# Run integration test (requires devnet connection, ~60s)
npm run test:integration

# Watch mode
npm run test:watch
```

**Test coverage:**
- Flag computation + dependency cascading
- XLS-89 metadata encoding/decoding + byte size validation
- PREIMAGE-SHA-256 crypto-condition generation (DER encoding)
- Constants and configuration values
- End-to-end devnet flow: create token → authorize → transfer → query

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **XRPL SDK** | xrpl.js 4.4.0+ (root), 4.6.0 (pe-trading) |
| **Styling** | Tailwind CSS 3.4 |
| **Testing** | Vitest 4.1 |
| **Network** | XRPL Devnet (all amendments active) |
| **Charts** | lightweight-charts 4.2 (pe-trading) |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| `AssetScale: 0` | 1 MPT = 1 whole share. No fractional shares in MVP. |
| Separate issuer + protocol accounts | XRPL prohibits the issuer from being the escrow source (XLS-85). |
| `tfMPTRequireAuth` enabled by default | Regulatory compliance: only issuer-approved wallets can hold equity. |
| Client-side only (no backend) | Every operation is a direct XRPL transaction. Demonstrates that the protocol works without centralized infrastructure. |
| Devnet over Testnet | Devnet has all required amendments active (XLS-33, XLS-65, XLS-66, XLS-70, XLS-85). |
| PREIMAGE-SHA-256 conditions | Escrow release requires knowledge of a secret — verifier approval is cryptographically enforced. |
| FinishAfter on escrows | Prevents premature claims before the verifier has time to review. |
| Transaction retry with backoff | XRPL devnet can be unreliable. 3 retries with exponential backoff (1s, 2s, 4s) on transient errors. |

---

## How to Test the MVP

### Equity Protocol (localhost:3000)

1. **Open the app** — it auto-connects to XRPL Devnet
2. **Issue a token** — click "Issue Token", fill in company details, configure flags, deploy
   - Watch the 4-phase deployment: wallets → create → configure → transfer
3. **Register a shareholder** — go to "Register Shares", upload a proof document, sign the transfer agreement
   - Creates an on-chain escrow with crypto-condition
4. **Verify ownership** — switch to "Verifier" tab, stake XRP, approve the registration
   - Issues an XLS-70 credential on-chain
5. **Distribute cashflow** — go to "Cashflow" tab, enter a distribution amount
   - Sends pro-rata IOU payments to all holders

### PE Trading Terminal (localhost:3001)

1. **Open the app** — first load takes ~30s to bootstrap on-chain infrastructure:
   - Funds 3 wallets from devnet faucet
   - Creates 2 equity tokens (ACME, VNTX) with MPT metadata
   - Deploys an XLS-65 liquidity vault
   - Creates an XLS-66 loan broker
   - Seeds DEX liquidity with standing bid/ask offers
2. **View portfolio** — see holdings, NAV, vault liquidity, available leverage
3. **Subsequent loads are instant** — wallet state persists in localStorage

---

## References

- [XLS-33: Multi-Purpose Tokens](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0033-multi-purpose-tokens)
- [XLS-85: Token Escrow](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0085-token-escrow)
- [XLS-70: Credentials](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0070-credentials)
- [XLS-89: Token Metadata](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [XLS-65: Single Asset Vault](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault)
- [XLS-66: Loan Broker](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-loan-broker)
- [XRPL MPT Documentation](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [Issue an MPT Tutorial](https://xrpl.org/docs/tutorials/how-tos/use-tokens/issue-a-multi-purpose-token)
- [xrpl.js Documentation](https://js.xrpl.org/)
- [XRPL Devnet Faucet](https://faucet.devnet.rippletest.net)

---

## License

MIT
