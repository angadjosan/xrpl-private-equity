# TDD: XRPL Private Equity Protocol

## 1. Problem

Private equity is illiquid by design. Shareholders in private companies are locked into positions for years, with no standardized way to transfer ownership, receive cashflows, or trade shares. The infrastructure that exists is fragmented, expensive, and excludes most participants.

## 2. Solution

A protocol that tokenizes private company shares as Multi-Purpose Tokens (MPTs) on the XRP Ledger, using Token Escrow for custody and automated cashflow distribution to shareholders — all on-chain, all auditable.

**Each MPT = 1 company share.** Cashflows (dividends, distributions) are paid proportionally to token holders in a specified currency. Secondary trading is gated by issuer authorization, enforcing compliance at the protocol level.

## 3. Why XRPL

- **Native MPT support (XLS-33):** Purpose-built fungible tokens without trust line overhead — ideal for representing shares at scale.
- **Token Escrow (XLS-85):** Mainnet-live since Feb 2026. Supports MPT escrow with time and crypto conditions — perfect for custody and distribution.
- **Built-in DEX:** Secondary trading without deploying a custom AMM or order book. MPTs trade natively with `tfMPTCanTrade`.
- **Issuer-gated transfers:** `tfMPTRequireAuth` enforces that only approved wallets can hold equity tokens — compliance baked into the protocol.
- **Low cost:** ~0.2 XRP reserve per escrow, minimal transaction fees. Per-shareholder distribution is economically viable.

---

## 4. Architecture

```
Company Shares (off-chain)
    → SPV issues MPTs (1 MPT = 1 share, on-chain)
        → Protocol account escrows MPTs for custody
            → Shareholders claim tokens via EscrowFinish
                → Cashflows distributed proportionally via Payment txns
                → Secondary trading via XRPL DEX (issuer-gated)
```

### 4.1 XRPL Account Roles

| Account | Role | Why Separate |
|---------|------|-------------|
| **Issuer** | Creates MPT, authorizes holders, locks/unlocks, claws back | Authority account — controls the token |
| **Protocol** | Receives MPTs from issuer, creates escrows, distributes cashflows | XRPL prohibits issuer from being escrow source (XLS-85 constraint) |
| **Shareholders** | Hold MPTs, trade on DEX, receive cashflows | End users |

### 4.2 Three Core Flows

| # | Flow | Description |
|---|------|-------------|
| 1 | **Create Token** | Configure MPT issuance with equity metadata, select flags, deploy to devnet |
| 2 | **Mint/Distribute** | Shareholders register shares; tokens released from escrow after authorization |
| 3 | **Buy/Sell** | Secondary trading on XRPL DEX; issuer-authorized buyers only |

### 4.3 Transaction Flow

```
┌──────────────┐
│   ISSUER     │  (SPV / Company)
└──────┬───────┘
       │
       ├─ 1. MPTokenIssuanceCreate (user-selected flags)
       │
       ├─ 2. MPTokenAuthorize → Protocol Account
       │
       ├─ 3. Payment (all MPTs) → Protocol Account
       │
       │      ┌──────────────┐
       │      │  PROTOCOL    │
       │      └──────┬───────┘
       │             │
       │             ├─ 4. EscrowCreate → Shareholder (per holder)
       │             │
       ├─ 5. MPTokenAuthorize → Shareholder
       │
       │             ├─ 6. EscrowFinish (shareholder claims)
       │             │
       │      ┌──────────────┐
       │      │ SHAREHOLDER  │  Holds MPTs = owns shares
       │      └──────┬───────┘
       │             │
       │     ┌───────┼───────┐
       │     ▼       ▼       ▼
       │  7.Trade  8.P2P   9.Cashflow
       │  (DEX)    Xfer    Distribution
       │
       ├─ 10. MPTokenIssuanceSet (lock/unlock — if flag enabled)
       └─ 11. Clawback (reclaim tokens — if flag enabled)
```

---

## 5. MPT Flags — All 6, User-Configurable in UI

**All flags are immutable after creation.** The Create Token UI exposes each flag as a toggle with clear labeling and dependency warnings.

### 5.1 Flag Reference

| Flag | Hex | Dec | Label in UI | Description | Default |
|------|-----|-----|-------------|-------------|---------|
| `tfMPTCanLock` | `0x02` | `2` | "Allow Freeze/Lock" | Issuer can lock individual or all holder balances. Use for corporate actions (mergers, splits, regulatory holds). | ON |
| `tfMPTRequireAuth` | `0x04` | `4` | "Require Holder Authorization" | Every holder must be explicitly authorized by issuer before receiving tokens. Enforces KYC/AML/accredited investor requirements. | ON |
| `tfMPTCanEscrow` | `0x08` | `8` | "Allow Token Escrow" | Holders can place balances into escrow. Required for the custody/distribution model. **Requires `tfMPTCanTransfer` to also be enabled.** | ON |
| `tfMPTCanTrade` | `0x10` | `16` | "Allow DEX Trading" | Holders can trade on XRPL's native decentralized exchange. Provides secondary market liquidity. | ON |
| `tfMPTCanTransfer` | `0x20` | `32` | "Allow Transfers" | Tokens can be transferred between non-issuer accounts. **Required dependency for Escrow and Trade.** | ON |
| `tfMPTCanClawback` | `0x40` | `64` | "Allow Clawback" | Issuer can reclaim tokens from holders. For fraud, court orders, failed KYC, share cancellation. | ON |

### 5.2 UI Flag Configuration Component

**File:** `src/components/FlagSelector.tsx`

```typescript
// Types
interface MPTFlag {
  key: string                       // e.g. "tfMPTCanLock"
  hex: number                       // e.g. 0x02
  label: string                     // UI display name
  description: string               // Tooltip/help text
  default: boolean                  // Default toggle state
  dependencies?: string[]           // Other flags that must be ON
  dependents?: string[]             // Flags that depend on this one
  warningIfOff?: string             // Warning shown when user disables
}

const MPT_FLAGS: MPTFlag[] = [
  {
    key: 'tfMPTCanTransfer',
    hex: 0x20,
    label: 'Allow Transfers',
    description: 'Tokens can be sent between non-issuer accounts. Required for escrow and DEX trading.',
    default: true,
    dependents: ['tfMPTCanEscrow', 'tfMPTCanTrade'],
    warningIfOff: 'Disabling transfers also disables Escrow and DEX Trading. Tokens can only be sent back to the issuer.'
  },
  {
    key: 'tfMPTCanEscrow',
    hex: 0x08,
    label: 'Allow Token Escrow',
    description: 'Holders can place tokens into escrow. Powers the custody and distribution model.',
    default: true,
    dependencies: ['tfMPTCanTransfer'],
    warningIfOff: 'Escrow is required for the share registration flow. Without it, shares must be sent directly.'
  },
  {
    key: 'tfMPTCanTrade',
    hex: 0x10,
    label: 'Allow DEX Trading',
    description: 'Enables secondary market trading on XRPL native DEX.',
    default: true,
    dependencies: ['tfMPTCanTransfer'],
    warningIfOff: 'Shares will not be tradeable on the XRPL DEX. Transfers are still possible if enabled.'
  },
  {
    key: 'tfMPTRequireAuth',
    hex: 0x04,
    label: 'Require Holder Authorization',
    description: 'Issuer must approve each wallet before it can hold tokens. Essential for regulatory compliance.',
    default: true,
    warningIfOff: 'Anyone can hold this token without issuer approval. Not recommended for securities.'
  },
  {
    key: 'tfMPTCanLock',
    hex: 0x02,
    label: 'Allow Freeze/Lock',
    description: 'Issuer can freeze individual or all balances. Useful during corporate actions or investigations.',
    default: true,
    warningIfOff: 'You will not be able to freeze trading during corporate actions.'
  },
  {
    key: 'tfMPTCanClawback',
    hex: 0x40,
    label: 'Allow Clawback',
    description: 'Issuer can reclaim tokens from holders. Required for regulatory compliance, fraud recovery.',
    default: true,
    warningIfOff: 'Tokens cannot be recovered once distributed. Not recommended for regulated securities.'
  }
]

// Compute combined flags value from user selections
function computeFlags(selections: Record<string, boolean>): number {
  return MPT_FLAGS.reduce((flags, flag) => {
    return selections[flag.key] ? flags | flag.hex : flags
  }, 0)
}

// Validate dependencies — returns list of errors
function validateFlags(selections: Record<string, boolean>): string[] {
  const errors: string[] = []
  for (const flag of MPT_FLAGS) {
    if (selections[flag.key] && flag.dependencies) {
      for (const dep of flag.dependencies) {
        if (!selections[dep]) {
          const depFlag = MPT_FLAGS.find(f => f.key === dep)
          errors.push(`"${flag.label}" requires "${depFlag?.label}" to be enabled.`)
        }
      }
    }
  }
  return errors
}
```

### 5.3 Flag Dependency Graph

```
tfMPTCanTransfer (0x20) ─── REQUIRED BY ──→ tfMPTCanEscrow (0x08)
                         └── REQUIRED BY ──→ tfMPTCanTrade  (0x10)

tfMPTCanLock     (0x02) ─── independent
tfMPTRequireAuth (0x04) ─── independent
tfMPTCanClawback (0x40) ─── independent
```

**UI behavior when `tfMPTCanTransfer` is toggled OFF:**
- `tfMPTCanEscrow` and `tfMPTCanTrade` are automatically disabled and greyed out
- Warning banner: "Disabling transfers also disables Escrow and DEX Trading"

### 5.4 Flag Usage Across All Flows

| Flow | Flags Exercised |
|------|----------------|
| Create Token | All selected flags set at creation (immutable) |
| Authorize Holder | `tfMPTRequireAuth` → issuer calls `MPTokenAuthorize` |
| Escrow Shares | `tfMPTCanEscrow` + `tfMPTCanTransfer` → `EscrowCreate` / `EscrowFinish` |
| DEX Trading | `tfMPTCanTrade` + `tfMPTCanTransfer` → XRPL DEX offers |
| P2P Transfer | `tfMPTCanTransfer` → `Payment` between holders |
| Lock/Freeze | `tfMPTCanLock` → `MPTokenIssuanceSet` (global/individual lock) |
| Clawback | `tfMPTCanClawback` → `Clawback` transaction |
| Cashflow Distribution | `tfMPTCanTransfer` → `Payment` of IOU/RLUSD to holders |

---

## 6. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 14+ (App Router) | React + TypeScript |
| Blockchain SDK | xrpl.js v4.4.0+ | Required for XLS-85 Token Escrow support |
| Styling | Tailwind CSS | Rapid UI development |
| Network | XRPL Devnet | `wss://s.devnet.rippletest.net:51233` — all amendments active |
| Faucet | Devnet faucet | `https://faucet.devnet.rippletest.net/accounts` |
| Cashflow Currency | Custom IOU on devnet | Simulates RLUSD (not available on devnet) |

---

## 7. XLS-89 Metadata Schema

On-chain metadata, hex-encoded, max 1024 bytes. Compressed keys per XLS-89:

| Short Key | Full Name | Required | Type |
|-----------|-----------|----------|------|
| `t` | ticker | Yes | string |
| `n` | name | Yes | string |
| `d` | description | No | string |
| `ac` | asset_class | Yes | string — `"rwa"` |
| `as` | asset_subclass | No | string — `"equity"` |
| `i` | icon | No | URL string |
| `in` | issuer_name | No | string |
| `us` | weblinks | No | `[{u, c, t}]` |
| `ai` | additional_info | No | object |

**Equity-specific `ai` fields:**

| Field | Description | Example |
|-------|-------------|---------|
| `share_class` | Class of shares | `"Class A Common"` |
| `par_value` | Par value per share | `"0.001"` |
| `cashflow_currency` | Base currency for distributions | `"USD"` |
| `cashflow_token` | On-chain token for distributions | `"RLUSD"` |
| `distribution_frequency` | How often cashflows are distributed | `"quarterly"` |
| `jurisdiction` | Legal jurisdiction | `"US-DE"` |
| `cusip` | CUSIP/ISIN if available | `""` |
| `transfer_restrictions` | Regulatory restrictions | `"Reg D 506(c)"` |

**Size estimate:** ~450 bytes for typical equity metadata — well within 1024 limit.

**UI:** The Create Token form populates these fields. The app builds the JSON, validates it's <= 1024 bytes, hex-encodes it, and passes it as `MPTokenMetadata`.

---

## 8. Detailed Flow Specifications

### 8.1 Flow 1: Create Token

**Page:** `/create`

**UI Form Fields:**

| Field | Input Type | Maps To |
|-------|-----------|---------|
| Company Name | text | metadata `n` |
| Ticker Symbol | text (max 10 chars) | metadata `t` |
| Description | textarea | metadata `d` |
| Total Shares | number | `MaximumAmount` |
| Asset Scale | number (0-15) | `AssetScale` — default 0 (whole shares) |
| Transfer Fee | number (0-50000) | `TransferFee` — in tenths of basis point |
| Share Class | text | metadata `ai.share_class` |
| Par Value | text | metadata `ai.par_value` |
| Cashflow Currency | text | metadata `ai.cashflow_currency` |
| Cashflow Token | text | metadata `ai.cashflow_token` |
| Distribution Frequency | select | metadata `ai.distribution_frequency` |
| Jurisdiction | text | metadata `ai.jurisdiction` |
| Company Website | URL | metadata `us[0].u` |
| **MPT Flags** | 6 toggles | `Flags` bitmask — see Section 5 |

**On submit — transaction sequence:**

```typescript
// 1. Create MPT
const createTx = {
  TransactionType: 'MPTokenIssuanceCreate',
  Account: issuerWallet.address,
  AssetScale: form.assetScale,
  MaximumAmount: String(form.totalShares),
  TransferFee: form.transferFee,
  Flags: computeFlags(form.flagSelections),
  MPTokenMetadata: buildMetadataHex(form)
}
const createResult = await client.submitAndWait(createTx, { wallet: issuerWallet })
const mptIssuanceId = extractMPTokenIssuanceID(createResult)

// 2. Authorize protocol account (if tfMPTRequireAuth is set)
if (form.flagSelections.tfMPTRequireAuth) {
  await client.submitAndWait({
    TransactionType: 'MPTokenAuthorize',
    Account: issuerWallet.address,
    MPTokenIssuanceID: mptIssuanceId,
    Holder: protocolWallet.address
  }, { wallet: issuerWallet })
}

// 3. Protocol account self-authorizes
await client.submitAndWait({
  TransactionType: 'MPTokenAuthorize',
  Account: protocolWallet.address,
  MPTokenIssuanceID: mptIssuanceId
}, { wallet: protocolWallet })

// 4. Issuer sends all MPTs to protocol account
await client.submitAndWait({
  TransactionType: 'Payment',
  Account: issuerWallet.address,
  Destination: protocolWallet.address,
  Amount: {
    mpt_issuance_id: mptIssuanceId,
    value: String(form.totalShares)
  }
}, { wallet: issuerWallet })
```

**Post-creation state:** Protocol account holds all MPTs. Issuer retains authority. `mptIssuanceId` stored in app state for subsequent flows.

### 8.2 Flow 2: Mint / Register Shares

**Page:** `/mint`

**Steps:**

1. **Shareholder attestation** — shareholder connects wallet, provides off-chain proof of ownership (document upload / signature in MVP)
2. **Issuer authorizes shareholder** — `MPTokenAuthorize` with `Holder` field
3. **Shareholder self-authorizes** — `MPTokenAuthorize` from shareholder's account
4. **Protocol creates escrow** — `EscrowCreate` from protocol account to shareholder

```typescript
const escrow = {
  TransactionType: 'EscrowCreate',
  Account: protocolWallet.address,
  Destination: shareholderAddress,
  Amount: {
    mpt_issuance_id: mptIssuanceId,
    value: String(shareCount)
  },
  Condition: ownershipProofCondition,         // PREIMAGE-SHA-256
  CancelAfter: rippleEpochNow + (90 * 86400) // 90 day expiry
}
```

5. **Shareholder claims** — `EscrowFinish` with fulfillment

```typescript
const finish = {
  TransactionType: 'EscrowFinish',
  Account: shareholderAddress,
  Owner: protocolWallet.address,
  OfferSequence: escrowSequence,
  Condition: ownershipProofCondition,
  Fulfillment: ownershipProofFulfillment
}
```

**Post-mint state:** Shareholder holds MPTs in their wallet. Escrow is closed.

### 8.3 Flow 3: Secondary Trading

**Page:** `/trade`

**3a: DEX Trading** (`tfMPTCanTrade` + `tfMPTCanTransfer`)
- Holders place offers on XRPL's native DEX
- `TransferFee` (if set) automatically collected by issuer on each trade
- Buyer must be pre-authorized if `tfMPTRequireAuth` is set

**3b: P2P Transfer** (`tfMPTCanTransfer`)
```typescript
const transfer = {
  TransactionType: 'Payment',
  Account: sellerAddress,
  Destination: buyerAddress,
  Amount: {
    mpt_issuance_id: mptIssuanceId,
    value: String(shareCount)
  }
}
```

**3c: Lock/Freeze** (`tfMPTCanLock`)
```typescript
// Global lock — all holders frozen
const globalLock = {
  TransactionType: 'MPTokenIssuanceSet',
  Account: issuerWallet.address,
  MPTokenIssuanceID: mptIssuanceId,
  Flags: 0x0001 // lsfMPTLocked
}

// Individual lock — single holder frozen
const individualLock = {
  TransactionType: 'MPTokenIssuanceSet',
  Account: issuerWallet.address,
  MPTokenIssuanceID: mptIssuanceId,
  Holder: targetAddress,
  Flags: 0x0001
}

// Unlock — same tx without the lock flag (Flags: 0)
```

**3d: Clawback** (`tfMPTCanClawback`)
```typescript
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

### 8.4 Cashflow Distribution

**Page:** `/distribute` (or section within dashboard)

```
Cashflow Event (e.g., quarterly dividend)
    → Company deposits IOU to distribution account
    → App queries all MPT holders and balances
    → Calculates: (total_cashflow / total_shares) × holder_balance
    → Submits Payment tx to each holder
    → Each holder receives proportional distribution
```

```typescript
// Query holders
const holders = await client.request({
  command: 'ledger_data',
  type: 'mptoken'
  // filter by MPTokenIssuanceID
})

// Distribute
for (const holder of holders) {
  const amount = (totalCashflow / totalShares) * holder.balance
  await client.submitAndWait({
    TransactionType: 'Payment',
    Account: distributionWallet.address,
    Destination: holder.account,
    Amount: {
      currency: cashflowCurrency,
      issuer: cashflowIssuer,
      value: String(amount)
    }
  }, { wallet: distributionWallet })
}
```

---

## 9. RWA Custody: The SPV Model

The standard legal pattern for tokenized equity:

1. **SPV** (LLC/trust) is formed as a legal entity
2. **Shares transferred to SPV** — company shares move into SPV custody
3. **SPV issues tokens** — SPV's XRPL account creates MPTs; each MPT = beneficial ownership of 1 share
4. **Legal agreement** — token holders sign operating agreement: token = beneficial ownership

**Hackathon MVP simplification:**
- SPV simulated by designated issuer account
- Web app captures legal metadata (company name, share class, jurisdiction)
- MPT on-chain metadata proves 1:1 share mapping
- UI attestation flow represents "signing over" process
- `tfMPTRequireAuth` ensures only approved wallets hold tokens

---

## 10. File Structure

```
xrpl-private-equity/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout, providers
│   │   ├── page.tsx                  # Landing / dashboard
│   │   ├── create/
│   │   │   └── page.tsx              # Flow 1: Create token form + flag toggles
│   │   ├── mint/
│   │   │   └── page.tsx              # Flow 2: Register shares + escrow claim
│   │   ├── trade/
│   │   │   └── page.tsx              # Flow 3: Transfer / DEX / lock / clawback
│   │   └── distribute/
│   │       └── page.tsx              # Cashflow distribution
│   ├── components/
│   │   ├── FlagSelector.tsx          # MPT flag toggle UI (Section 5.2)
│   │   ├── MetadataForm.tsx          # XLS-89 metadata fields
│   │   ├── WalletConnect.tsx         # Wallet connection / generation
│   │   ├── TransactionStatus.tsx     # Tx submission feedback
│   │   └── HolderTable.tsx           # Display MPT holders + balances
│   ├── lib/
│   │   ├── xrpl/
│   │   │   ├── client.ts             # XRPL client connection manager
│   │   │   ├── mpt.ts               # MPTokenIssuanceCreate, Set, Authorize, Clawback
│   │   │   ├── escrow.ts            # EscrowCreate, EscrowFinish, EscrowCancel
│   │   │   ├── payments.ts          # Payment (MPT transfers + cashflow distribution)
│   │   │   └── queries.ts           # ledger_data, account_objects queries
│   │   ├── metadata.ts              # XLS-89 JSON → hex encoding, validation
│   │   ├── flags.ts                 # MPT_FLAGS config, computeFlags, validateFlags
│   │   └── constants.ts             # Network URLs, Ripple epoch, etc.
│   └── types/
│       └── index.ts                  # Shared TypeScript types
├── public/                           # Static assets
├── TDD.md                            # This document
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .env.local                        # XRPL network config (no secrets)
```

---

## 11. Implementation Order

| Step | Task | Files | Depends On |
|------|------|-------|------------|
| 1 | Project scaffolding | `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.js` | — |
| 2 | XRPL client + constants | `lib/xrpl/client.ts`, `lib/constants.ts` | Step 1 |
| 3 | Flag system | `lib/flags.ts`, `components/FlagSelector.tsx` | Step 1 |
| 4 | Metadata encoder | `lib/metadata.ts`, `components/MetadataForm.tsx` | Step 1 |
| 5 | MPT operations | `lib/xrpl/mpt.ts` | Step 2 |
| 6 | Create Token page | `app/create/page.tsx` | Steps 2-5 |
| 7 | Escrow operations | `lib/xrpl/escrow.ts` | Step 2 |
| 8 | Mint/Register page | `app/mint/page.tsx` | Steps 5, 7 |
| 9 | Payment operations | `lib/xrpl/payments.ts` | Step 2 |
| 10 | Trade page (transfer + lock + clawback) | `app/trade/page.tsx` | Steps 5, 9 |
| 11 | Query helpers | `lib/xrpl/queries.ts` | Step 2 |
| 12 | Cashflow distribution page | `app/distribute/page.tsx` | Steps 9, 11 |
| 13 | Dashboard / landing | `app/page.tsx` | Steps 6, 8, 10, 12 |
| 14 | Wallet management | `components/WalletConnect.tsx` | Step 2 |
| 15 | README | `README.md` | All |

---

## 12. Design Decisions

| Decision | Rationale |
|----------|-----------|
| `AssetScale: 0` default | Shares are whole units — no fractional shares in MVP. User can change to 2+ in UI for fractional. |
| All 6 flags ON by default | Maximize XRPL primitive usage. User can toggle any off with clear warnings. |
| Flags editable in UI | Immutable after creation — UI makes this clear with confirmation dialog. |
| Devnet over Testnet | Devnet has all amendments (XLS-33, XLS-85) active reliably. |
| Custom IOU for cashflows | RLUSD not on devnet; custom IOU simulates same mechanics. |
| Separate issuer + protocol accounts | XRPL prohibits issuer from being escrow source. Required. |
| PREIMAGE-SHA-256 conditions | Escrow release requires proof of ownership (crypto-condition). |
| xrpl.js v4.4.0+ | Minimum version with XLS-85 Token Escrow support. |
| Next.js App Router | Modern React patterns, server components where useful, fast iteration. |
| Tailwind CSS | No time for custom design system at a hackathon. |

---

## 13. Network Configuration

```typescript
// lib/constants.ts
export const XRPL_DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233'
export const XRPL_DEVNET_FAUCET = 'https://faucet.devnet.rippletest.net/accounts'
export const RIPPLE_EPOCH_OFFSET = 946684800 // seconds between Unix epoch and Ripple epoch
```

---

## 14. References

- [XRPL MPT Documentation](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [XLS-33: Multi-Purpose Tokens](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0033-multi-purpose-tokens)
- [XLS-85: Token Escrow](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0085-token-escrow)
- [XLS-89: Token Metadata](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [Issue an MPT Tutorial](https://xrpl.org/docs/tutorials/how-tos/use-tokens/issue-a-multi-purpose-token)
- [Creating Asset-Backed MPTs](https://xrpl.org/docs/use-cases/tokenization/creating-an-asset-backed-multi-purpose-token)
- [MPTokenIssuanceCreate Reference](https://xrpl.org/docs/references/protocol/transactions/types/mptokenissuancecreate)
- [EscrowCreate Reference](https://xrpl.org/docs/references/protocol/transactions/types/escrowcreate)
- [xrpl.js](https://js.xrpl.org/)
- [RWA Tokenization via SPV](https://www.rwa.io/post/spv-for-tokenized-assets-setup-and-governance)
- [Equity Tokenization Compliance](https://www.rwa.io/post/equity-tokenization-structure-and-compliance)
