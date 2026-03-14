// =============================================================================
// XRPL Private Equity Protocol — Constants & Network Configuration
// =============================================================================

/** XRPL Devnet WebSocket endpoint (all amendments active incl. XLS-33, XLS-85) */
export const XRPL_DEVNET_WSS = 'wss://s.devnet.rippletest.net:51233'

/** XRPL Devnet faucet URL for generating funded wallets */
export const XRPL_DEVNET_FAUCET = 'https://faucet.devnet.rippletest.net/accounts'

/** Seconds between Unix epoch (1970-01-01T00:00:00Z) and Ripple epoch (2000-01-01T00:00:00Z) */
export const RIPPLE_EPOCH_OFFSET = 946684800

/** Default escrow expiry: 90 days in seconds */
export const DEFAULT_ESCROW_EXPIRY_SECONDS = 90 * 24 * 60 * 60

/** Maximum metadata size in bytes per XLS-89 spec */
export const MAX_METADATA_BYTES = 1024

/** Default asset scale — 0 means whole shares, no fractional units */
export const DEFAULT_ASSET_SCALE = 0

/** Maximum transfer fee: 50000 = 50% (in tenths of a basis point) */
export const MAX_TRANSFER_FEE = 50000

/** MPT flag hex values for MPTokenIssuanceCreate */
export const MPT_FLAG_VALUES = {
  tfMPTCanLock: 0x02,
  tfMPTRequireAuth: 0x04,
  tfMPTCanEscrow: 0x08,
  tfMPTCanTrade: 0x10,
  tfMPTCanTransfer: 0x20,
  tfMPTCanClawback: 0x40,
} as const

/** MPTokenIssuanceSet lock flag (lsfMPTLocked) */
export const LSF_MPT_LOCKED = 0x0001

/** Maximum number of transaction retry attempts */
export const MAX_TX_RETRIES = 3

/** Base delay for exponential backoff on tx retry (milliseconds) */
export const RETRY_BASE_DELAY_MS = 1000

/** Default network identifier */
export const NETWORK = 'devnet'

/** Default verification period in days for share registration */
export const DEFAULT_VERIFICATION_PERIOD_DAYS = 14

/** Available verification period options in days */
export const VERIFICATION_PERIOD_OPTIONS = [7, 14, 30, 60, 90] as const

/** Credential type string for verified share ownership */
export const CREDENTIAL_TYPE_SHARE_VERIFIED = 'ShareOwnershipVerified'
