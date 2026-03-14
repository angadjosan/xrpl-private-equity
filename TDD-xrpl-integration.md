# TDD: XRPL Integration Layer

## Overview

This document specifies the XRPL integration layer (`src/lib/`) for the Private Equity Protocol. It covers client connection management, MPT operations, token escrow, payments, query helpers, crypto-condition generation, error handling, metadata encoding, flag utilities, and constants.

All functions interact with XRPL Devnet via `xrpl.js` v4.4.0+.

---

## 1. XRPL Client Connection Management

**File:** `src/lib/xrpl/client.ts`

### Design

- Singleton pattern: one `xrpl.Client` instance per application lifecycle.
- Auto-reconnect on disconnect with exponential backoff (max 3 retries).
- Health check via `client.isConnected()` before every operation.
- All public functions accept an `xrpl.Client` parameter — the module provides helpers to get/create the singleton but does not hide the client.

### Connection Lifecycle

```
getClient() → lazy-creates singleton
  → client.connect() if not connected
  → returns connected client

disconnectClient() → client.disconnect(), nulls singleton

reconnectClient() → disconnect + connect with fresh instance
```

### Exported Functions

```typescript
/**
 * Returns the singleton XRPL client, creating and connecting if needed.
 * @param url - WebSocket URL (defaults to XRPL_DEVNET_WSS)
 * @returns Connected xrpl.Client instance
 */
export async function getClient(url?: string): Promise<xrpl.Client>

/**
 * Disconnects and destroys the singleton client.
 */
export async function disconnectClient(): Promise<void>

/**
 * Tears down existing connection and establishes a fresh one.
 * @param url - WebSocket URL (defaults to XRPL_DEVNET_WSS)
 * @returns Connected xrpl.Client instance
 */
export async function reconnectClient(url?: string): Promise<xrpl.Client>

/**
 * Returns true if the singleton client exists and is connected.
 */
export function isConnected(): boolean

/**
 * Generates a funded wallet from the devnet faucet.
 * @param client - Connected xrpl.Client
 * @returns { wallet: xrpl.Wallet, balance: number }
 */
export async function generateFaucetWallet(
  client: xrpl.Client
): Promise<{ wallet: xrpl.Wallet; balance: number }>
```

---

## 2. MPT Operations

**File:** `src/lib/xrpl/mpt.ts`

All MPT operations use `client.submitAndWait()` for confirmed results. Each function returns the full `TxResponse` for upstream consumption.

### Exported Functions

```typescript
import type { Client, Wallet, TxResponse } from 'xrpl'

interface CreateMPTConfig {
  assetScale?: number       // 0-15, default 0
  maximumAmount: string     // total supply as string
  transferFee?: number      // 0-50000 (tenths of basis point)
  flags: number             // computed from computeFlags()
  metadata?: string         // hex-encoded XLS-89 metadata
}

/**
 * Creates an MPTokenIssuance on-ledger.
 * Submits MPTokenIssuanceCreate and returns the tx result.
 * The MPTokenIssuanceID is extracted from the result metadata.
 *
 * @param client - Connected XRPL client
 * @param wallet - Issuer wallet that will own the issuance
 * @param config - Issuance configuration
 * @returns TxResponse from submitAndWait
 */
export async function createMPTIssuance(
  client: Client,
  wallet: Wallet,
  config: CreateMPTConfig
): Promise<TxResponse>

/**
 * Extracts the MPTokenIssuanceID from a createMPTIssuance result.
 * Parses the transaction metadata (AffectedNodes) to find the
 * created MPTokenIssuance ledger object.
 *
 * @param txResponse - Result from createMPTIssuance
 * @returns MPTokenIssuanceID hex string
 * @throws if ID cannot be extracted
 */
export function extractMPTokenIssuanceID(txResponse: TxResponse): string

/**
 * Issuer authorizes a holder address to hold the MPT.
 * Submits MPTokenAuthorize with Holder field from the issuer account.
 *
 * @param client - Connected XRPL client
 * @param issuerWallet - Issuer wallet
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param holderAddress - The r-address to authorize
 * @returns TxResponse
 */
export async function authorizeMPTHolder(
  client: Client,
  issuerWallet: Wallet,
  mptIssuanceId: string,
  holderAddress: string
): Promise<TxResponse>

/**
 * Holder self-authorizes to hold an MPT (opt-in).
 * Submits MPTokenAuthorize from the holder's own account (no Holder field).
 *
 * @param client - Connected XRPL client
 * @param holderWallet - The holder's wallet
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @returns TxResponse
 */
export async function selfAuthorizeMPT(
  client: Client,
  holderWallet: Wallet,
  mptIssuanceId: string
): Promise<TxResponse>

/**
 * Locks (freezes) an MPT globally or for a specific holder.
 * Submits MPTokenIssuanceSet with Flags: 0x0001 (lsfMPTLocked).
 *
 * @param client - Connected XRPL client
 * @param issuerWallet - Issuer wallet
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param holderAddress - Optional. If provided, locks only this holder. If omitted, global lock.
 * @returns TxResponse
 */
export async function lockMPT(
  client: Client,
  issuerWallet: Wallet,
  mptIssuanceId: string,
  holderAddress?: string
): Promise<TxResponse>

/**
 * Unlocks an MPT globally or for a specific holder.
 * Submits MPTokenIssuanceSet with Flags: 0 (no lock flag).
 *
 * @param client - Connected XRPL client
 * @param issuerWallet - Issuer wallet
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param holderAddress - Optional. If provided, unlocks only this holder.
 * @returns TxResponse
 */
export async function unlockMPT(
  client: Client,
  issuerWallet: Wallet,
  mptIssuanceId: string,
  holderAddress?: string
): Promise<TxResponse>

/**
 * Claws back MPTs from a holder.
 * Submits Clawback transaction. Requires tfMPTCanClawback flag on the issuance.
 *
 * @param client - Connected XRPL client
 * @param issuerWallet - Issuer wallet
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param holderAddress - Address to claw back from
 * @param amount - Amount to claw back as string
 * @returns TxResponse
 */
export async function clawbackMPT(
  client: Client,
  issuerWallet: Wallet,
  mptIssuanceId: string,
  holderAddress: string,
  amount: string
): Promise<TxResponse>
```

---

## 3. Token Escrow Operations

**File:** `src/lib/xrpl/escrow.ts`

XRPL Token Escrow (XLS-85) allows MPTs to be held in escrow with time and crypto conditions. Key constraint: **the issuer account CANNOT be the escrow source** — the protocol account must create escrows.

### Crypto-Condition Generation

Uses PREIMAGE-SHA-256 (type 0) from the crypto-conditions spec. The fulfillment is a random 32-byte preimage; the condition is its SHA-256 hash, DER-encoded per the crypto-conditions RFC.

### Exported Functions

```typescript
import type { Client, Wallet, TxResponse } from 'xrpl'

interface CryptoConditionPair {
  condition: string     // hex-encoded DER condition
  fulfillment: string   // hex-encoded DER fulfillment (preimage)
}

/**
 * Generates a PREIMAGE-SHA-256 crypto-condition pair.
 * The fulfillment is a random 32-byte preimage.
 * The condition is the SHA-256 hash of the preimage, DER-encoded.
 *
 * @returns { condition, fulfillment } both as uppercase hex strings
 */
export function generateCryptoCondition(): CryptoConditionPair

/**
 * Creates an MPT escrow from the protocol account to a destination.
 * Submits EscrowCreate with MPT Amount, Condition, and CancelAfter.
 *
 * @param client - Connected XRPL client
 * @param protocolWallet - Protocol account wallet (escrow source)
 * @param destination - Recipient r-address
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param amount - Amount of MPT to escrow as string
 * @param condition - Hex-encoded crypto-condition
 * @param cancelAfter - Ripple epoch timestamp after which escrow can be cancelled
 * @returns TxResponse (includes OfferSequence in metadata)
 */
export async function createMPTEscrow(
  client: Client,
  protocolWallet: Wallet,
  destination: string,
  mptIssuanceId: string,
  amount: string,
  condition: string,
  cancelAfter: number
): Promise<TxResponse>

/**
 * Finishes (claims) an MPT escrow by providing the fulfillment.
 *
 * @param client - Connected XRPL client
 * @param finisherWallet - Wallet submitting the finish (usually the destination)
 * @param owner - The escrow owner (protocol account address)
 * @param offerSequence - Sequence number from the EscrowCreate tx
 * @param condition - The original condition (hex)
 * @param fulfillment - The fulfillment that satisfies the condition (hex)
 * @returns TxResponse
 */
export async function finishMPTEscrow(
  client: Client,
  finisherWallet: Wallet,
  owner: string,
  offerSequence: number,
  condition: string,
  fulfillment: string
): Promise<TxResponse>

/**
 * Cancels an expired MPT escrow, returning tokens to the owner.
 *
 * @param client - Connected XRPL client
 * @param cancelerWallet - Wallet submitting the cancel (can be anyone)
 * @param owner - The escrow owner address
 * @param offerSequence - Sequence number from the EscrowCreate tx
 * @returns TxResponse
 */
export async function cancelMPTEscrow(
  client: Client,
  cancelerWallet: Wallet,
  owner: string,
  offerSequence: number
): Promise<TxResponse>
```

---

## 4. Payment Operations

**File:** `src/lib/xrpl/payments.ts`

### Exported Functions

```typescript
import type { Client, Wallet, TxResponse } from 'xrpl'

/**
 * Sends an MPT payment from sender to destination.
 *
 * @param client - Connected XRPL client
 * @param senderWallet - Sender wallet
 * @param destination - Recipient r-address
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param amount - Amount as string
 * @returns TxResponse
 */
export async function sendMPTPayment(
  client: Client,
  senderWallet: Wallet,
  destination: string,
  mptIssuanceId: string,
  amount: string
): Promise<TxResponse>

interface HolderBalance {
  account: string
  balance: string
}

/**
 * Distributes cashflow (IOU) proportionally to all MPT holders.
 * Queries holders, computes pro-rata share, sends Payment to each.
 *
 * @param client - Connected XRPL client
 * @param distributionWallet - Wallet funding the distribution
 * @param mptIssuanceId - The MPTokenIssuanceID to query holders for
 * @param holders - Array of { account, balance } for all holders
 * @param totalAmount - Total cashflow amount to distribute as string
 * @param currency - IOU currency code (e.g., "USD")
 * @param currencyIssuer - IOU issuer r-address
 * @returns Array of TxResponse, one per holder payment
 */
export async function distributeCashflow(
  client: Client,
  distributionWallet: Wallet,
  mptIssuanceId: string,
  holders: HolderBalance[],
  totalAmount: string,
  currency: string,
  currencyIssuer: string
): Promise<TxResponse[]>
```

---

## 5. Query Helpers

**File:** `src/lib/xrpl/queries.ts`

All queries use `client.request()` with the appropriate XRPL WebSocket command.

### Exported Functions

```typescript
import type { Client } from 'xrpl'

interface MPTHolder {
  account: string
  balance: string
  flags: number
  mptIssuanceId: string
}

interface AccountMPT {
  mptIssuanceId: string
  balance: string
  flags: number
}

interface EscrowObject {
  account: string
  destination: string
  amount: string | { mpt_issuance_id: string; value: string }
  condition?: string
  cancelAfter?: number
  finishAfter?: number
  offerSequence: number
}

interface MPTIssuanceInfo {
  mptIssuanceId: string
  issuer: string
  assetScale: number
  maximumAmount: string
  outstandingAmount: string
  transferFee: number
  flags: number
  metadata?: string
}

/**
 * Returns all holders of a given MPT with their balances.
 * Uses ledger_data filtered by mptoken type or account_objects.
 *
 * @param client - Connected XRPL client
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @returns Array of MPTHolder
 */
export async function getMPTHolders(
  client: Client,
  mptIssuanceId: string
): Promise<MPTHolder[]>

/**
 * Returns all MPTs held by an account.
 * Uses account_objects with type "mptoken".
 *
 * @param client - Connected XRPL client
 * @param address - The r-address to query
 * @returns Array of AccountMPT
 */
export async function getAccountMPTs(
  client: Client,
  address: string
): Promise<AccountMPT[]>

/**
 * Returns all pending escrows for an account (as owner or destination).
 * Uses account_objects with type "escrow".
 *
 * @param client - Connected XRPL client
 * @param address - The r-address to query
 * @returns Array of EscrowObject
 */
export async function getAccountEscrows(
  client: Client,
  address: string
): Promise<EscrowObject[]>

/**
 * Returns details of a specific MPT issuance.
 * Uses ledger_entry to fetch the MPTokenIssuance object.
 *
 * @param client - Connected XRPL client
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @returns MPTIssuanceInfo
 */
export async function getMPTIssuance(
  client: Client,
  mptIssuanceId: string
): Promise<MPTIssuanceInfo>

/**
 * Returns all DEX offers for an account.
 * Uses account_offers command.
 *
 * @param client - Connected XRPL client
 * @param address - The r-address to query
 * @returns Array of offer objects
 */
export async function getAccountOffers(
  client: Client,
  address: string
): Promise<any[]>
```

---

## 6. Crypto-Condition Generation

**File:** `src/lib/xrpl/escrow.ts` (co-located with escrow operations)

### PREIMAGE-SHA-256 Specification

Per the crypto-conditions RFC (draft-thomas-crypto-conditions):

- **Type:** PREIMAGE-SHA-256 (type 0)
- **Fulfillment:** DER-encoded: `A0` + length + preimage bytes
- **Condition:** DER-encoded: `A0` + length + (`80` + `20` + SHA-256(preimage)) + (`81` + `01` + preimage_length)

### Implementation

1. Generate 32 random bytes (preimage) using `crypto.randomBytes(32)`
2. Encode fulfillment: DER tag `A0`, length prefix, raw preimage
3. Compute SHA-256 hash of the preimage
4. Encode condition: DER tag `A0`, containing fingerprint (`80 20` + hash) and cost (`81 01 20`)
5. Return both as uppercase hex strings

---

## 7. Error Handling Strategy

### Transaction Failures

All `submitAndWait` calls are wrapped in try/catch. The error object from xrpl.js contains:
- `data.result` — the transaction result code (e.g., `tecNO_PERMISSION`, `tefPAST_SEQ`)
- `message` — human-readable error

Strategy:
- **`tesSUCCESS`** — success, return result
- **`tec*` codes** — transaction was applied but failed (e.g., insufficient funds, no permission). Throw with descriptive message.
- **`tef*` / `tel*` codes** — transaction not applied. May be retryable (e.g., sequence issues).
- **`tem*` codes** — malformed transaction. Throw immediately, not retryable.

### Network Errors

- WebSocket disconnects trigger automatic reconnection via `reconnectClient()`.
- Operations that fail due to disconnection are retried once after reconnection.

### Sequence Conflicts

- xrpl.js auto-fills `Sequence` via `autofill()` inside `submitAndWait`. If a `tefPAST_SEQ` error occurs, the transaction is retried once (xrpl.js handles this internally in most cases).

---

## 8. Transaction Retry Logic

Implemented as a wrapper utility used by all transaction-submitting functions:

```typescript
/**
 * Submits a transaction with retry logic.
 * Retries up to MAX_RETRIES times on retryable errors (tef*, tel*).
 * Does NOT retry on tec* or tem* errors.
 *
 * @param client - Connected XRPL client
 * @param tx - Transaction object
 * @param wallet - Signing wallet
 * @param maxRetries - Max retry attempts (default: 3)
 * @returns TxResponse
 */
async function submitWithRetry(
  client: Client,
  tx: Record<string, unknown>,
  wallet: Wallet,
  maxRetries?: number
): Promise<TxResponse>
```

Retry backoff: 1s, 2s, 4s (exponential).

---

## 9. Flag Computation and Validation Utilities

**File:** `src/lib/flags.ts`

### Data Structure

```typescript
interface MPTFlag {
  key: string
  hex: number
  label: string
  description: string
  default: boolean
  dependencies?: string[]
  dependents?: string[]
  warningIfOff?: string
}
```

### Exported Constants and Functions

```typescript
/**
 * All 6 MPT flags with metadata, dependencies, and warnings.
 */
export const MPT_FLAGS: MPTFlag[]

/**
 * Computes the combined flags bitmask from user selections.
 * @param selections - Map of flag key to boolean (on/off)
 * @returns Combined flags number (bitwise OR of selected flag hex values)
 */
export function computeFlags(selections: Record<string, boolean>): number

/**
 * Validates flag dependencies. Returns array of human-readable error strings.
 * Empty array = valid.
 * @param selections - Map of flag key to boolean
 * @returns Array of error messages (empty if valid)
 */
export function validateFlags(selections: Record<string, boolean>): string[]
```

### Flag Values

| Flag | Hex | Decimal |
|------|-----|---------|
| tfMPTCanLock | 0x02 | 2 |
| tfMPTRequireAuth | 0x04 | 4 |
| tfMPTCanEscrow | 0x08 | 8 |
| tfMPTCanTrade | 0x10 | 16 |
| tfMPTCanTransfer | 0x20 | 32 |
| tfMPTCanClawback | 0x40 | 64 |

### Dependency Rules

- `tfMPTCanEscrow` requires `tfMPTCanTransfer`
- `tfMPTCanTrade` requires `tfMPTCanTransfer`
- Disabling `tfMPTCanTransfer` must auto-disable `tfMPTCanEscrow` and `tfMPTCanTrade`

---

## 10. XLS-89 Metadata Encoding/Decoding

**File:** `src/lib/metadata.ts`

### Schema (Compressed Keys per XLS-89)

| Key | Full Name | Required |
|-----|-----------|----------|
| t | ticker | Yes |
| n | name | Yes |
| d | description | No |
| ac | asset_class | Yes ("rwa") |
| as | asset_subclass | No ("equity") |
| i | icon | No |
| in | issuer_name | No |
| us | weblinks | No |
| ai | additional_info | No |

### Exported Functions

```typescript
interface MetadataInput {
  ticker: string
  name: string
  description?: string
  assetClass?: string        // defaults to "rwa"
  assetSubclass?: string     // defaults to "equity"
  icon?: string
  issuerName?: string
  website?: string
  additionalInfo?: Record<string, string>
}

/**
 * Builds XLS-89 metadata JSON from form inputs and converts to hex.
 * Applies compressed key mapping per XLS-89 spec.
 * Validates total size <= 1024 bytes.
 *
 * @param input - Form data
 * @returns Uppercase hex string for MPTokenMetadata field
 * @throws if encoded metadata exceeds 1024 bytes
 */
export function buildMetadataHex(input: MetadataInput): string

/**
 * Decodes hex-encoded metadata back to the original JSON object.
 *
 * @param hex - Hex string from MPTokenMetadata
 * @returns Parsed JSON object with compressed keys
 */
export function decodeMetadataHex(hex: string): Record<string, unknown>

/**
 * Returns the byte size of the metadata when encoded.
 * Used for validation before submission.
 *
 * @param input - Form data
 * @returns Byte count of the hex-encoded metadata
 */
export function getMetadataSize(input: MetadataInput): number

/**
 * Maximum allowed metadata size in bytes.
 */
export const MAX_METADATA_BYTES = 1024
```

---

## 11. Constants and Network Configuration

**File:** `src/lib/constants.ts`

```typescript
/** XRPL Devnet WebSocket endpoint */
export const XRPL_DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233'

/** XRPL Devnet faucet URL */
export const XRPL_DEVNET_FAUCET = 'https://faucet.devnet.rippletest.net/accounts'

/** Seconds between Unix epoch (1970-01-01) and Ripple epoch (2000-01-01) */
export const RIPPLE_EPOCH_OFFSET = 946684800

/** Default escrow expiry: 90 days in seconds */
export const DEFAULT_ESCROW_EXPIRY_SECONDS = 90 * 86400

/** Maximum metadata size in bytes per XLS-89 */
export const MAX_METADATA_BYTES = 1024

/** Default asset scale (0 = whole shares) */
export const DEFAULT_ASSET_SCALE = 0

/** Maximum transfer fee (50000 = 50%) */
export const MAX_TRANSFER_FEE = 50000

/** MPTokenIssuanceSet lock flag */
export const LSF_MPT_LOCKED = 0x0001

/** Transaction retry configuration */
export const MAX_TX_RETRIES = 3
export const RETRY_BASE_DELAY_MS = 1000
```

---

## 12. Module Dependency Graph

```
constants.ts ← used by all modules
flags.ts     ← standalone, no XRPL dependency
metadata.ts  ← standalone, no XRPL dependency

xrpl/client.ts   ← depends on constants.ts
xrpl/mpt.ts      ← depends on client.ts, constants.ts
xrpl/escrow.ts   ← depends on client.ts, constants.ts
xrpl/payments.ts ← depends on client.ts, queries.ts
xrpl/queries.ts  ← depends on client.ts
```

---

## 13. Testing Strategy

Each module should be testable in isolation:

- **flags.ts, metadata.ts** — pure functions, unit-testable without XRPL connection
- **xrpl/client.ts** — integration test against devnet
- **xrpl/mpt.ts, escrow.ts, payments.ts, queries.ts** — integration tests using devnet faucet wallets

Test pattern:
1. Generate faucet wallets
2. Create MPT issuance
3. Authorize holders
4. Execute operations
5. Query and assert state

---

## 14. Security Considerations

- Private keys never leave the client process (xrpl.js signs locally)
- Faucet wallets are devnet-only; production would use hardware wallets or custodial signing
- Crypto-condition preimages must be stored securely between EscrowCreate and EscrowFinish
- No secrets in constants or committed code
