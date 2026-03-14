# TDD: Infrastructure — Security, State, Testing, Deployment

## 1. Security Considerations

### Wallet Key Handling
- All wallets are **devnet-only, ephemeral, generated in-browser** via faucet
- No private keys stored in `.env` or persisted to disk
- Wallet objects (seed, privateKey, address) live only in React Context state
- Page refresh = wallets lost (by design for devnet demo)

### Input Validation
- `validateAddress(address)` — regex check for XRPL r-address format
- `validateAmount(amount)` — positive finite number
- `validateTicker(ticker)` — 1-10 uppercase alphanumeric
- `validateAssetScale(scale)` — integer 0-15
- `validateTransferFee(fee)` — integer 0-50000
- `validateMetadataSize(size)` — ≤1024 bytes

### XSS Prevention
- React's built-in JSX escaping handles output encoding
- No `dangerouslySetInnerHTML` used anywhere
- All user inputs are typed (number fields, controlled inputs)

## 2. Error Handling

### Error Classes
- `XRPLConnectionError` — network connectivity failures
- `TransactionError` — XRPL transaction result codes (tec*, tem*, tef*)
- `ValidationError` — input validation failures with optional field name

### XRPL Error Code Mapping
Human-readable messages for common codes:
- `tecUNFUNDED` → "Account does not have enough XRP..."
- `tecNO_AUTH` → "Holder is not authorized..."
- `tecFROZEN` → "This token is currently frozen/locked..."
- `tefPAST_SEQ` → "Transaction sequence is in the past..."
- `temDISABLED` → "This feature is not enabled..."

### Transaction Status Pattern
Every transaction goes through: `idle → submitting → success | error`
- `useTransaction()` hook manages this lifecycle
- `TransactionStatus` component renders appropriate feedback
- `execute(fn, message)` wraps any async tx function

## 3. State Management Architecture

```
XRPLProvider (connection + client)
  └── WalletProvider (issuer, protocol, shareholders)
      └── TokenProvider (mptIssuanceId, metadata, holders)
          └── App pages
```

- Contexts are nested in dependency order
- Each context exports both Provider component and accessor hook
- Hooks throw if used outside their provider

## 4. Environment Configuration

### .env.local
```
NEXT_PUBLIC_XRPL_WSS=wss://s.devnet.rippletest.net:51233
NEXT_PUBLIC_XRPL_FAUCET=https://faucet.devnet.rippletest.net/accounts
NEXT_PUBLIC_NETWORK=devnet
```

- All values are public (NEXT_PUBLIC_ prefix) — no secrets
- Constants in `src/lib/constants.ts` for code access

## 5. Testing Strategy

### Manual Test Script (`src/test/manual-test-flow.ts`)
End-to-end flow on devnet:
1. Connect to devnet
2. Fund 3 wallets (issuer, protocol, shareholder)
3. Create MPT issuance with all flags
4. Authorize + send MPTs to protocol
5. Create escrow → finish escrow
6. Verify shareholder holds tokens
7. Test lock/unlock
8. Test clawback
9. Test cashflow distribution

### What to Test
- Flag dependency cascading (UI logic)
- Metadata size validation (≤1024 bytes)
- Transaction error handling (simulate failures)
- Wallet generation flow
- Multi-step transaction sequences (correct ordering)

## 6. Performance Considerations

- **Singleton client** — one WebSocket connection, reused across all operations
- **Sequential distributions** — avoid sequence number conflicts in batch payments
- **Paginated queries** — `getMPTHolders` uses marker-based pagination
- **No polling** — holders/state refreshed on-demand (button click)

## 7. Deployment

- **Vercel-ready** — standard Next.js App Router project
- No server-side secrets needed
- `next.config.js` handles webpack fallbacks for xrpl.js Node.js dependencies
- All XRPL operations run client-side (browser)

## 8. Devnet Considerations

- Devnet resets periodically — all accounts and tokens are wiped
- Faucet rate limits: ~10 requests/minute per IP
- All XLS-33 and XLS-85 amendments active on devnet
- Network latency: expect 3-5 second transaction confirmation times
- Custom IOU used instead of RLUSD (not available on devnet)

## 9. File Inventory

### Context Providers (`src/context/`)
- `XRPLContext.tsx` — client connection lifecycle
- `WalletContext.tsx` — wallet generation + storage
- `TokenContext.tsx` — current token state
- `AppProviders.tsx` — nested provider wrapper

### Hooks (`src/hooks/`)
- `useXRPL.ts` — access XRPL client + status
- `useWallet.ts` — access wallet state + generators
- `useToken.ts` — access token state + setters
- `useTransaction.ts` — transaction submission state machine

### Utils (`src/utils/`)
- `errors.ts` — error classes + XRPL error code mapping
- `validation.ts` — input validation helpers
- `format.ts` — display formatting (XRP, addresses, timestamps)
