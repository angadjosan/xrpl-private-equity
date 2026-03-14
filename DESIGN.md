# XRPL Private Equity - Technical Design Document

## Overview

Tokenize private equity on XRPL. Company shares become RWAs via Multi-Purpose Tokens (MPTs). Cashflows are distributed to shareholders via Token Escrow. The protocol uses **all 6 MPT flags** to maximize XRPL primitive utilization.

---

## MPT Flag Strategy: Using Every Flag

We use **ALL 6** `MPTokenIssuanceCreate` flags. Here's why each one matters for private equity:

| Flag | Hex | Dec | Our Use Case |
|------|-----|-----|-------------|
| `tfMPTCanLock` | `0x02` | `2` | **Freeze trading** during corporate actions (stock splits, mergers, regulatory holds). Issuer can lock individual holder balances or all balances globally. |
| `tfMPTRequireAuth` | `0x04` | `4` | **KYC/AML gating**. Every holder must be explicitly authorized by the issuer before they can receive shares. Enforces accredited investor requirements. |
| `tfMPTCanEscrow` | `0x08` | `8` | **Token Escrow integration**. Shares are held in escrow until ownership is verified. Cashflow distributions use conditional escrow. |
| `tfMPTCanTrade` | `0x10` | `16` | **DEX trading**. Enables secondary market for shares on XRPL's native DEX. Provides liquidity for traditionally illiquid private equity. |
| `tfMPTCanTransfer` | `0x20` | `32` | **P2P transfers**. Shareholders can transfer shares to other authorized holders outside the DEX (e.g., block trades, private sales). |
| `tfMPTCanClawback` | `0x40` | `64` | **Regulatory compliance**. Issuer can reclaim tokens in cases of fraud, court orders, failed KYC, or share cancellation. Essential for regulated securities. |

**Combined Flags Value:** `0x02 | 0x04 | 0x08 | 0x10 | 0x20 | 0x40` = **`126`** (decimal)

---

## Transaction Flow Diagram

```
                    ┌──────────────┐
                    │   ISSUER     │  (SPV / Company)
                    │   Account    │
                    └──────┬───────┘
                           │
           1. MPTokenIssuanceCreate (flags=126)
                           │
                           ▼
                    ┌──────────────┐
                    │  MPT Issued  │  MPTokenIssuanceID created
                    │  (on-chain)  │
                    └──────┬───────┘
                           │
           2. Payment: Issuer → Protocol Account
                           │
                           ▼
                    ┌──────────────┐
                    │  PROTOCOL    │  Holds shares for distribution
                    │  Account     │
                    └──────┬───────┘
                           │
           3. EscrowCreate: Protocol → Shareholder (per holder)
                           │
                           ▼
                    ┌──────────────┐
                    │  ESCROW      │  Shares locked with conditions
                    │  (on-chain)  │
                    └──────┬───────┘
                           │
           4. MPTokenAuthorize (issuer approves holder)
           5. EscrowFinish (release shares to holder)
                           │
                           ▼
                    ┌──────────────┐
                    │ SHAREHOLDER  │  Holds MPTs = owns shares
                    │  Account     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         6. Trade      7. Transfer   8. Receive
         (DEX)         (P2P)         Cashflows
```

---

## Detailed Flow Specifications

### Flow 1: Create Token (MPT Issuance)

**Transaction:** `MPTokenIssuanceCreate`

```typescript
import { Client, Wallet, MPTokenIssuanceCreateFlags } from 'xrpl'

// All 6 flags combined
const ALL_FLAGS =
  MPTokenIssuanceCreateFlags.tfMPTCanLock |      // 0x02
  MPTokenIssuanceCreateFlags.tfMPTRequireAuth |  // 0x04
  MPTokenIssuanceCreateFlags.tfMPTCanEscrow |    // 0x08
  MPTokenIssuanceCreateFlags.tfMPTCanTrade |     // 0x10
  MPTokenIssuanceCreateFlags.tfMPTCanTransfer |  // 0x20
  MPTokenIssuanceCreateFlags.tfMPTCanClawback    // 0x40

const metadata = {
  t: "EQUITY",                    // ticker
  n: "Acme Corp Class A Shares",  // name
  d: "Each token = 1 share of Acme Corp Class A common stock",
  ac: "rwa",                      // asset_class
  as: "equity",                   // asset_subclass
  in: "Acme Corp SPV LLC",        // issuer_name
  us: [{                          // weblinks
    u: "https://acme.example.com",
    c: "website",
    t: "Company Website"
  }],
  ai: {                           // additional_info
    share_class: "Class A Common",
    par_value: "0.001",
    cashflow_currency: "USD",
    cashflow_token: "RLUSD",
    distribution_frequency: "quarterly",
    jurisdiction: "US-DE",
    cusip: "",                    // filled if available
    transfer_restrictions: "Reg D 506(c) - Accredited Investors Only"
  }
}

const metadataHex = Buffer.from(JSON.stringify(metadata)).toString('hex')
// Must be <= 1024 bytes

const tx = {
  TransactionType: 'MPTokenIssuanceCreate',
  Account: issuerWallet.address,
  AssetScale: 0,                    // 1 MPT = 1 whole share (no fractions)
  MaximumAmount: String(totalShares), // e.g., "10000000" for 10M shares
  TransferFee: 100,                 // 0.01% transfer fee (in tenths of basis point)
  Flags: ALL_FLAGS,                 // 126 - all flags enabled
  MPTokenMetadata: metadataHex
}

const result = await client.submitAndWait(tx, { wallet: issuerWallet })
// Extract MPTokenIssuanceID from result
```

**Why every field matters:**
- `AssetScale: 0` - Shares are whole units, not subdivisible
- `MaximumAmount` - Matches authorized share count from corporate charter
- `TransferFee: 100` - Protocol earns 0.01% on secondary trades (revenue model)
- `Flags: 126` - Full feature set (see flag table above)
- `MPTokenMetadata` - XLS-89 compliant, includes cashflow currency spec

### Flow 2: Mint / Register Shares

**Step 2a: Authorize protocol account + transfer shares to it**

```typescript
// Issuer authorizes protocol account to hold MPTs
const authProtocol = {
  TransactionType: 'MPTokenAuthorize',
  Account: issuerWallet.address,
  MPTokenIssuanceID: mptIssuanceId,
  Holder: protocolAccount.address    // authorize protocol to hold
}

// Protocol account also authorizes itself to hold
const protocolAuth = {
  TransactionType: 'MPTokenAuthorize',
  Account: protocolAccount.address,
  MPTokenIssuanceID: mptIssuanceId
}

// Issuer sends all shares to protocol account
const mintPayment = {
  TransactionType: 'Payment',
  Account: issuerWallet.address,
  Destination: protocolAccount.address,
  Amount: {
    mpt_issuance_id: mptIssuanceId,
    value: String(totalShares)
  }
}
```

**Step 2b: Escrow shares for each shareholder**

```typescript
// Protocol creates escrow for shareholder's portion
const escrow = {
  TransactionType: 'EscrowCreate',
  Account: protocolAccount.address,
  Destination: shareholderAddress,
  Amount: {
    mpt_issuance_id: mptIssuanceId,
    value: String(shareCount)
  },
  // Condition: PREIMAGE-SHA-256 - shareholder must provide proof of ownership
  Condition: ownershipProofCondition,
  // Escrow expires in 90 days if unclaimed
  CancelAfter: rippleEpochNow + (90 * 24 * 60 * 60)
}
```

**Step 2c: Shareholder claims shares**

```typescript
// 1. Issuer authorizes the shareholder
const authHolder = {
  TransactionType: 'MPTokenAuthorize',
  Account: issuerWallet.address,
  MPTokenIssuanceID: mptIssuanceId,
  Holder: shareholderAddress
}

// 2. Shareholder authorizes themselves to hold
const holderAuth = {
  TransactionType: 'MPTokenAuthorize',
  Account: shareholderAddress,
  MPTokenIssuanceID: mptIssuanceId
}

// 3. Shareholder provides fulfillment to release escrow
const finish = {
  TransactionType: 'EscrowFinish',
  Account: shareholderAddress,
  Owner: protocolAccount.address,
  OfferSequence: escrowSequence,
  Condition: ownershipProofCondition,
  Fulfillment: ownershipProofFulfillment
}
```

### Flow 3: Secondary Trading & Transfers

**3a: DEX Trading (tfMPTCanTrade)**

Holders can place offers on XRPL's native DEX to buy/sell shares for XRP or other tokens. The `TransferFee` (0.01%) is automatically collected by the issuer on each trade.

**3b: P2P Transfer (tfMPTCanTransfer)**

```typescript
// Direct transfer between authorized holders
const transfer = {
  TransactionType: 'Payment',
  Account: sellerAddress,
  Destination: buyerAddress,
  Amount: {
    mpt_issuance_id: mptIssuanceId,
    value: String(shareCount)
  }
}
// Buyer must already be authorized via MPTokenAuthorize
```

**3c: Lock During Corporate Actions (tfMPTCanLock)**

```typescript
// Lock ALL trading during a merger/acquisition
const globalLock = {
  TransactionType: 'MPTokenIssuanceSet',
  Account: issuerWallet.address,
  MPTokenIssuanceID: mptIssuanceId,
  Flags: 0x0001  // lsfMPTLocked - global lock
}

// Lock a specific holder (e.g., insider trading investigation)
const individualLock = {
  TransactionType: 'MPTokenIssuanceSet',
  Account: issuerWallet.address,
  MPTokenIssuanceID: mptIssuanceId,
  Holder: suspectAddress,
  Flags: 0x0001  // lock this holder only
}
```

**3d: Clawback (tfMPTCanClawback)**

```typescript
// Reclaim shares from a holder (court order, failed KYC, fraud)
const clawback = {
  TransactionType: 'Clawback',
  Account: issuerWallet.address,
  Amount: {
    mpt_issuance_id: mptIssuanceId,
    value: String(shareCount),
    issuer: holderAddress
  }
}
```

---

## Cashflow Distribution Design

### How Dividends/Distributions Work

```
Company declares $100,000 distribution
    │
    ▼
1. Company deposits RLUSD to distribution account
    │
    ▼
2. App queries all MPT holders via XRPL API:
   GET account_objects (type: mpt_issuance) → list all MPToken holders
    │
    ▼
3. Calculate pro-rata: (holder_balance / outstanding_amount) × total_distribution
    │
    ▼
4. Option A: Direct Payments (simple)
   - Payment tx per holder with RLUSD amount

   Option B: Escrowed Distributions (advanced)
   - EscrowCreate per holder with RLUSD
   - FinishAfter: distribution record date
   - Condition: holder must still hold shares at record date
    │
    ▼
5. Each holder receives proportional RLUSD
```

### Querying MPT Holders

```typescript
// Get all holders of an MPT
const response = await client.request({
  command: 'ledger_data',
  type: 'mptoken',
  // filter by MPTokenIssuanceID
})

// Or use account_objects on each known holder
const holderInfo = await client.request({
  command: 'account_objects',
  account: holderAddress,
  type: 'mptoken'
})
```

---

## XLS-89 Metadata Schema (Compressed)

Our metadata must fit in 1024 bytes. Using compressed keys:

| Short Key | Full Name | Required | Our Value |
|-----------|-----------|----------|-----------|
| `t` | ticker | Yes | `"EQUITY"` |
| `n` | name | Yes | `"[Company] Shares"` |
| `d` | description | No | `"Each token = 1 share..."` |
| `ac` | asset_class | Yes | `"rwa"` |
| `as` | asset_subclass | No | `"equity"` |
| `i` | icon | No | URL to company logo |
| `in` | issuer_name | No | SPV name |
| `us` | weblinks | No | Company URL |
| `ai` | additional_info | No | Cashflow currency, jurisdiction, restrictions |

**Size estimate:** ~450 bytes for typical equity metadata (well within 1024 limit).

---

## XRPL Accounts Architecture

| Account | Role | Funding |
|---------|------|---------|
| **Issuer** | Creates MPT, authorizes holders, locks/claws back | Funded via testnet faucet |
| **Protocol** | Receives MPTs from issuer, creates escrows | Funded via testnet faucet |
| **Shareholders** | Hold MPTs, trade on DEX, receive cashflows | Funded via testnet faucet |

**Why separate Issuer and Protocol?**
- Issuer cannot create escrows (XLS-85 constraint)
- Protocol account acts as the escrow source
- Clean separation of concerns: issuer = authority, protocol = operations

---

## Flag Usage Summary Per Flow

| Flow | Flags Used |
|------|-----------|
| Create Token | All 6 set at creation |
| Authorize Holder | `tfMPTRequireAuth` (issuer must approve) |
| Escrow Shares | `tfMPTCanEscrow` + `tfMPTCanTransfer` |
| DEX Trading | `tfMPTCanTrade` + `tfMPTCanTransfer` |
| P2P Transfer | `tfMPTCanTransfer` |
| Lock Shares | `tfMPTCanLock` (global or individual) |
| Clawback | `tfMPTCanClawback` |
| Cashflow Dist | `tfMPTCanTransfer` (RLUSD payments to holders) |

**All 6 flags are actively exercised in at least one flow.**

---

## Open Design Decisions

1. **Fractional shares**: `AssetScale: 0` means no fractions. If we want fractional shares, set `AssetScale: 2` for 0.01 share granularity.
2. **Transfer fee revenue**: `TransferFee: 100` = 0.01%. Could be higher for illiquid PE. Max is 50,000 (5%).
3. **Escrow conditions**: Using PREIMAGE-SHA-256 crypto-conditions vs. time-based `FinishAfter` for share claims.
4. **Share count changes**: No mutable `MaximumAmount` yet (XLS-94 pending). Current approach: create new issuance + migrate holders.

---

## Network Configuration

- **Devnet WSS:** `wss://s.devnet.rippletest.net:51233`
- **Devnet Faucet:** `https://faucet.devnet.rippletest.net/accounts`
- Devnet has all amendments (XLS-33, XLS-85) active
- Use devnet over testnet for latest feature support
