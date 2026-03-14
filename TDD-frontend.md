# TDD: Frontend Architecture

## 1. Component Architecture

### Component Tree
```
AppProviders (XRPLProvider → WalletProvider → TokenProvider)
└── Layout
    ├── Navigation (nav bar + connection status)
    └── Pages
        ├── Dashboard (page.tsx) — status cards, wallet management, flow nav
        ├── Create Token (/create) — MetadataForm + FlagSelector + submission
        ├── Mint Shares (/mint) — shareholder registration + escrow claim
        ├── Trade (/trade) — transfer, lock/freeze, clawback tabs
        └── Distribute (/distribute) — cashflow distribution form + results
```

### Shared Components
| Component | Purpose | Props |
|-----------|---------|-------|
| `Navigation` | App nav bar, connection status indicator | — (uses hooks) |
| `FlagSelector` | 6 MPT flag toggles with dependency logic | `selections, onChange, disabled` |
| `MetadataForm` | XLS-89 metadata fields (14 inputs) | `form, onChange, metadataSize, disabled` |
| `WalletConnect` | Generate issuer/protocol/shareholder wallets | — (uses hooks) |
| `TransactionStatus` | Loading/success/error feedback | `result, onReset` |
| `HolderTable` | MPT holders with balances and actions | `holders, totalShares, onLock, onUnlock, onClawback` |

## 2. State Management

Three React Context providers, nested:

### XRPLContext
- `client: Client | null` — singleton xrpl.js client
- `status: ConnectionStatus` — disconnected | connecting | connected | error
- Auto-connects on mount, auto-disconnects on unmount

### WalletContext
- `wallets: { issuer, protocol, shareholders[] }` — all devnet wallets
- `generateIssuer/Protocol()` — funds wallet from devnet faucet
- `addShareholder()` / `removeShareholder(index)` — manage shareholder list

### TokenContext
- `token: { mptIssuanceId, metadata, totalShares, flags, holders }` — current token state
- Setters for each field, plus `reset()` to clear all

### useTransaction Hook
- Wraps async tx functions with `idle → submitting → success | error` state
- `execute(txFn, successMessage)` — runs the function, manages state
- `reset()` — return to idle

## 3. Page Flows

### /create — Create Token (4-step transaction sequence)
1. `MPTokenIssuanceCreate` with flags + metadata
2. `MPTokenAuthorize` — issuer authorizes protocol account
3. `MPTokenAuthorize` — protocol self-authorizes
4. `Payment` — issuer sends all MPTs to protocol

### /mint — Mint Shares (per shareholder)
1. `MPTokenAuthorize` — issuer authorizes shareholder
2. `MPTokenAuthorize` — shareholder self-authorizes
3. `generateCryptoCondition()` — PREIMAGE-SHA-256 pair
4. `EscrowCreate` — protocol escrows MPTs to shareholder
5. `EscrowFinish` — shareholder claims with fulfillment

### /trade — Transfer / Lock / Clawback (tabbed UI)
- **Transfer tab**: P2P Payment between shareholders
- **Lock tab**: Global or individual freeze via MPTokenIssuanceSet
- **Clawback tab**: Reclaim tokens via Clawback transaction

### /distribute — Cashflow Distribution
- Input: total amount, currency code, issuer address
- Calculates per-share amount, sends Payment to each holder
- Shows per-holder results (success/failure)

## 4. Styling

- Tailwind CSS with custom utility classes: `.card`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input`, `.label`
- Dark theme: bg-gray-900 cards, gray-800 inputs, blue-600 primary, green-400 success, red-400 error
- Custom color palette: `xrpl.blue`, `xrpl.dark`, `xrpl.card`, `xrpl.border`

## 5. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| All state in React Context | Simple, no external state library needed for MVP |
| `'use client'` on all pages | All pages need wallet state and XRPL client |
| Wallets stored in-memory only | Devnet wallets are ephemeral; no persistence needed |
| Step-by-step transaction feedback | Multi-step flows need clear progress indication |
| Tabbed UI on /trade | Keeps page focused; each action has distinct inputs |
