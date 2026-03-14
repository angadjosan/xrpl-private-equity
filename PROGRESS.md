# XRPL Private Equity

## The Problem

Private equity is illiquid by design. Shareholders in private companies are locked into positions for years, with no standardized way to transfer ownership, receive cashflows, or trade shares. The infrastructure that exists is fragmented, expensive, and excludes most participants.

## The Solution

A protocol that tokenizes private company shares as Multi-Purpose Tokens (MPTs) on the XRP Ledger, using Token Escrow for custody and automated cashflow distribution to shareholders — all on-chain, all auditable.

**Each MPT = 1 company share.** Cashflows (dividends, distributions) are paid proportionally to token holders in RLUSD or a specified IOU. Secondary trading is gated by issuer authorization, enforcing compliance at the protocol level.

**Target:** Working demo on XRPL Devnet for the Ripple Track hackathon.

---

## Architecture

```
Company Shares (off-chain)
    → SPV issues MPTs (1 MPT = 1 share, on-chain)
        → Protocol account escrows MPTs for custody
            → Shareholders claim tokens via EscrowFinish
                → Cashflows distributed proportionally via Payment txns
                → Secondary trading via XRPL DEX (issuer-gated)
```

### Three Core Flows

| Flow | Description | Status |
|------|-------------|--------|
| 1. Create Token | Configure MPT issuance with equity metadata and compliance flags | NOT STARTED |
| 2. Mint/Distribute | Shareholders register shares; tokens released from escrow | NOT STARTED |
| 3. Buy/Sell | Secondary trading on XRPL DEX; issuer-authorized buyers only | NOT STARTED |

---

## Why XRPL

- **Native MPT support (XLS-33):** Purpose-built fungible tokens without trust line overhead — ideal for representing shares at scale.
- **Token Escrow (XLS-85):** Mainnet-live since Feb 2026. Supports MPT escrow with time and crypto conditions — perfect for custody and distribution.
- **Built-in DEX:** Secondary trading without deploying a custom AMM or order book. MPTs trade natively with `tfMPTCanTrade`.
- **Issuer-gated transfers:** `tfMPTRequireAuth` enforces that only KYC'd/approved wallets can hold equity tokens — compliance baked into the protocol.
- **Low cost:** ~0.2 XRP reserve per escrow, minimal transaction fees. Makes per-shareholder distribution economically viable.

---

## Technical Design

### Tech Stack

- **Frontend:** Next.js + React (TypeScript)
- **Blockchain SDK:** xrpl.js v4.4.0+ (required for XLS-85 Token Escrow support)
- **Network:** XRPL Devnet — `wss://s.devnet.rippletest.net:51233`
- **Cashflow currency:** Custom IOU on devnet (simulating RLUSD)

### XRPL Primitives

#### Multi-Purpose Tokens (XLS-33)

MPTs are XRPL-native fungible tokens optimized for high-holder-count use cases like equity.

**Transaction types used:**
- `MPTokenIssuanceCreate` — Creates the token issuance (immutable config)
- `MPTokenIssuanceSet` — Modifies mutable properties post-issuance
- `MPTokenAuthorize` — Issuer authorizes holders (required with `tfMPTRequireAuth`)
- `Payment` — Extended to support MPT transfers between authorized holders

**Configuration for equity tokens:**
```typescript
{
  TransactionType: 'MPTokenIssuanceCreate',
  Account: issuer.address,
  AssetScale: 0,                    // 1 MPT = 1 whole share, no subdivision
  MaximumAmount: String(totalShares),
  TransferFee: 0,                   // or small fee for protocol revenue
  Flags: {
    tfMPTCanTransfer: true,         // enables secondary trading
    tfMPTCanEscrow: true,           // enables Token Escrow integration
    tfMPTCanTrade: true,            // enables XRPL DEX trading
    tfMPTRequireAuth: true          // issuer must authorize every holder
  },
  MPTokenMetadata: encodedMetadataHex
}
```

**On-chain metadata (XLS-89 schema, max 1024 bytes):**
```json
{
  "t": "EQUITY",
  "n": "CompanyName Class A Shares",
  "d": "Each token represents 1 Class A share of CompanyName held by the SPV",
  "asset_class": "rwa",
  "asset_subclass": "equity",
  "cashflow_currency": "RLUSD",
  "cashflow_issuer": "rXXXX...",
  "distribution_frequency": "quarterly",
  "icon": "https://...",
  "weblinks": [{"url": "https://company.com"}]
}
```

> **Note:** Metadata is hex-encoded. The above JSON (~350 bytes uncompressed) fits well within the 1024-byte limit even after encoding.

#### Token Escrow (XLS-85)

Activated on XRPL mainnet Feb 12, 2026. Extends escrow to support IOUs and MPTs.

**Key constraints for MPT escrow:**
- Token must have both `tfMPTCanEscrow` and `tfMPTCanTransfer` flags set
- **Issuer cannot be the escrow source** — requires a separate protocol account
- Each escrow requires ~0.2 XRP reserve
- `CancelAfter` is required for all token escrows
- Transfer fee is captured at `EscrowCreate` time (locked in at creation)

**Account architecture:**

```
Issuer Account (creates MPTs)
    │
    ├── Payment ──→ Protocol Account (holds MPTs, creates escrows)
    │                    │
    │                    ├── EscrowCreate ──→ Shareholder A
    │                    ├── EscrowCreate ──→ Shareholder B
    │                    └── EscrowCreate ──→ Shareholder C
    │
    └── MPTokenAuthorize ──→ (authorizes each shareholder to hold tokens)
```

The issuer and protocol accounts are separated because XRPL prohibits the issuer from being the escrow source. The issuer retains authorization control; the protocol account handles custody and distribution.

### RWA Custody: The SPV Model

The standard legal pattern for tokenized equity:

1. **SPV (Special Purpose Vehicle)** — a legal entity (LLC/trust) is formed
2. **Shares transferred to SPV** — actual company shares move into SPV custody
3. **SPV issues tokens** — the SPV's XRPL account issues MPTs; each MPT = beneficial ownership of 1 share
4. **Legal agreement** — token holders sign an operating agreement acknowledging token = beneficial ownership

**For the hackathon MVP:** The SPV is simulated by a designated issuer account. The web app captures legal metadata and the MPT on-chain metadata proves the 1:1 share mapping. A UI attestation flow represents the "signing over" process.

---

## Implementation Plan

### Flow 1: Create Token (MPT Issuance)

1. User connects/creates an XRPL wallet (this becomes the issuer account)
2. User fills form: company name, total shares, share class, cashflow currency
3. App constructs and submits `MPTokenIssuanceCreate` with equity flags and XLS-89 metadata
4. App stores the returned `MPTokenIssuanceID` for subsequent flows
5. Issuer sends full MPT supply to the protocol account via `Payment`

### Flow 2: Mint / Register Shares

1. Protocol account places MPTs into Token Escrow (one escrow per shareholder allocation)
2. Shareholder proves ownership (off-chain attestation in MVP — UI signature + document upload)
3. Issuer authorizes shareholder via `MPTokenAuthorize`
4. `EscrowFinish` releases the shareholder's MPTs to their wallet

### Flow 3: Secondary Trading

1. Buyer requests authorization — submits KYC/attestation via the app
2. Issuer approves buyer via `MPTokenAuthorize`
3. Shareholder lists shares on XRPL DEX (enabled by `tfMPTCanTrade`)
4. Trade executes on-chain; `TransferFee` (if set) goes to issuer
5. Legal beneficial ownership transfers automatically per the SPV operating agreement

### Cashflow Distribution

```
Cashflow Event (e.g., quarterly dividend)
    → Company deposits IOU/RLUSD to distribution account
    → App queries all MPT holders and balances via XRPL API
    → Calculates: (total_cashflow / total_shares) × holder_balance
    → Submits Payment transactions to each holder
    → Each holder receives proportional distribution
```

**Future enhancement:** Use Token Escrow for cashflow distribution itself — escrow IOU with time-based release conditions per holder.

---

## File Structure

```
xrpl-private-equity/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── page.tsx            # Landing / dashboard
│   │   ├── create/             # Flow 1: Create token
│   │   ├── mint/               # Flow 2: Mint / register shares
│   │   └── trade/              # Flow 3: Buy / sell
│   ├── lib/
│   │   ├── xrpl/
│   │   │   ├── client.ts       # XRPL connection manager
│   │   │   ├── mpt.ts          # MPT issuance + authorization
│   │   │   ├── escrow.ts       # Token escrow operations
│   │   │   └── distribute.ts   # Cashflow distribution logic
│   │   └── metadata.ts         # XLS-89 metadata encoding
│   └── components/             # Shared React components
├── PROGRESS.md
├── README.md
└── package.json
```

---

## Current Status

| Task | Status | Notes |
|------|--------|-------|
| Research: MPT (XLS-33) | DONE | Flags, metadata schema, transaction types validated against xrpl.js v4.4.0 |
| Research: Token Escrow (XLS-85) | DONE | Issuer-cannot-escrow constraint identified; protocol account pattern designed |
| Research: RWA custody patterns | DONE | SPV model documented with hackathon simplification |
| Architecture & flow design | DONE | Three flows + cashflow distribution designed end-to-end |
| Project scaffolding | NOT STARTED | Next.js + xrpl.js v4.4.0+ |
| Flow 1: Create Token | NOT STARTED | |
| Flow 2: Mint / Register | NOT STARTED | |
| Flow 3: Buy / Sell | NOT STARTED | |
| Cashflow distribution | NOT STARTED | |
| Devnet deployment & demo | NOT STARTED | |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| `AssetScale: 0` | Shares are whole units — no fractional shares in MVP |
| Devnet over Testnet | Devnet has the latest amendments (XLS-33 + XLS-85) enabled more reliably |
| Custom IOU over RLUSD | RLUSD not available on devnet; custom IOU simulates the same cashflow mechanics |
| Separate issuer + protocol accounts | XRPL prohibits issuer from being escrow source; two-account pattern is required |
| `tfMPTRequireAuth` enabled | Regulatory compliance: only issuer-approved wallets can hold equity tokens |
| xrpl.js v4.4.0+ | Minimum version with Token Escrow (XLS-85) support |

---

## References

- [XRPL MPT Documentation](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [XLS-33: Multi-Purpose Tokens](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0033-multi-purpose-tokens)
- [XLS-85: Token Escrow](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0085-token-escrow)
- [XLS-89: Token Metadata](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [Issue an MPT Tutorial](https://xrpl.org/docs/tutorials/how-tos/use-tokens/issue-a-multi-purpose-token)
- [Creating Asset-Backed MPTs](https://xrpl.org/docs/use-cases/tokenization/creating-an-asset-backed-multi-purpose-token)
- [xrpl.js v4.4.0 Changelog](https://github.com/XRPLF/xrpl.js/blob/main/packages/xrpl/HISTORY.md) — XLS-85 support added
- [RWA Tokenization via SPV](https://www.rwa.io/post/spv-for-tokenized-assets-setup-and-compliance)
