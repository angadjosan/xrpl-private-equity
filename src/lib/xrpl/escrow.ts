// =============================================================================
// Token Escrow Operations (XLS-85)
// Create, finish, and cancel MPT escrows with PREIMAGE-SHA-256 conditions.
// CONSTRAINT: Issuer account CANNOT be escrow source — use Protocol account.
// =============================================================================

import type { Client, Wallet, TxResponse } from 'xrpl'
import { RIPPLE_EPOCH_OFFSET, DEFAULT_ESCROW_EXPIRY_SECONDS } from '../constants'
import type { CryptoConditionPair } from '@/types'
import { submitWithRetry } from './client'

// ─── Escrow Create ──────────────────────────────────────────────────────────

/**
 * Creates an MPT escrow from the protocol account to a shareholder.
 * The protocol account must hold the MPTs (issuer cannot be escrow source per XLS-85).
 *
 * @param client - Connected XRPL client
 * @param protocolWallet - Protocol account wallet (escrow source, NOT the issuer)
 * @param destination - Recipient r-address (shareholder)
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param amount - Amount of MPT to escrow as string
 * @param condition - Optional hex-encoded PREIMAGE-SHA-256 crypto-condition
 * @param cancelAfterSeconds - Seconds from now until escrow can be cancelled (default: 90 days)
 * @returns Object containing TxResponse and the escrow's sequence number
 */
export async function createMPTEscrow(
  client: Client,
  protocolWallet: Wallet,
  destination: string,
  mptIssuanceId: string,
  amount: string,
  condition?: string,
  cancelAfterSeconds: number = DEFAULT_ESCROW_EXPIRY_SECONDS
): Promise<{ result: TxResponse; sequence: number }> {
  const cancelAfter = unixToRippleTime(Date.now() / 1000 + cancelAfterSeconds)

  const tx: Record<string, unknown> = {
    TransactionType: 'EscrowCreate',
    Account: protocolWallet.address,
    Destination: destination,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value: amount,
    },
    CancelAfter: cancelAfter,
  }

  if (condition) {
    tx.Condition = condition
  }

  const result = await submitWithRetry(client, tx, protocolWallet)

  // Extract the escrow sequence from the transaction result
  const sequence = (result.result as Record<string, unknown>).Sequence as number

  return { result, sequence }
}

// ─── Escrow Finish ──────────────────────────────────────────────────────────

/**
 * Finishes (claims) an MPT escrow by providing the fulfillment.
 * Can be submitted by anyone, but typically the destination (shareholder).
 *
 * @param client - Connected XRPL client
 * @param finisherWallet - Wallet submitting the finish (usually the destination)
 * @param owner - The escrow owner (protocol account address)
 * @param offerSequence - Sequence number from the EscrowCreate transaction
 * @param condition - Optional: the original condition (hex), required if escrow has a condition
 * @param fulfillment - Optional: the fulfillment that satisfies the condition (hex)
 * @returns TxResponse
 */
export async function finishMPTEscrow(
  client: Client,
  finisherWallet: Wallet,
  owner: string,
  offerSequence: number,
  condition?: string,
  fulfillment?: string
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'EscrowFinish',
    Account: finisherWallet.address,
    Owner: owner,
    OfferSequence: offerSequence,
  }

  if (condition && fulfillment) {
    tx.Condition = condition
    tx.Fulfillment = fulfillment
  }

  return submitWithRetry(client, tx, finisherWallet)
}

// ─── Escrow Cancel ──────────────────────────────────────────────────────────

/**
 * Cancels an expired MPT escrow, returning tokens to the owner (protocol account).
 * Can only succeed after the CancelAfter time has passed.
 * Can be submitted by anyone.
 *
 * @param client - Connected XRPL client
 * @param cancelerWallet - Wallet submitting the cancel (can be anyone)
 * @param owner - The escrow owner address (protocol account)
 * @param offerSequence - Sequence number from the EscrowCreate transaction
 * @returns TxResponse
 */
export async function cancelMPTEscrow(
  client: Client,
  cancelerWallet: Wallet,
  owner: string,
  offerSequence: number
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'EscrowCancel',
    Account: cancelerWallet.address,
    Owner: owner,
    OfferSequence: offerSequence,
  }
  return submitWithRetry(client, tx, cancelerWallet)
}

// ─── Crypto-Condition Generation ────────────────────────────────────────────

/**
 * Generates a PREIMAGE-SHA-256 crypto-condition pair (type 0).
 *
 * Per the crypto-conditions RFC (draft-thomas-crypto-conditions):
 * - Fulfillment: DER-encoded as A0 + length + (80 20 + preimage)
 * - Condition:   DER-encoded as A0 + length + (80 20 + SHA-256(preimage)) + (81 01 20)
 *
 * The preimage is a random 32-byte value generated via Web Crypto API.
 *
 * @returns { condition, fulfillment } both as uppercase hex strings
 */
export async function generateCryptoCondition(): Promise<CryptoConditionPair> {
  // Generate random 32-byte preimage
  const preimage = new Uint8Array(32)
  crypto.getRandomValues(preimage)

  // Hash with SHA-256 to get the fingerprint
  const hashBuffer = await crypto.subtle.digest('SHA-256', preimage)
  const hash = new Uint8Array(hashBuffer)

  // DER-encode the condition:
  // A0 25 = compound type tag, total length 37 bytes
  //   80 20 = fingerprint tag, 32 bytes of SHA-256 hash
  //   81 01 20 = cost tag, 1 byte, value 32 (preimage length)
  const conditionBytes = new Uint8Array([
    0xA0, 0x25,       // type 0 (PREIMAGE-SHA-256), length 37
    0x80, 0x20,       // fingerprint tag, length 32
    ...hash,
    0x81, 0x01, 0x20  // cost tag, length 1, value 32
  ])

  // DER-encode the fulfillment:
  // A0 22 = compound type tag, total length 34 bytes
  //   80 20 = preimage tag, 32 bytes of preimage
  const fulfillmentBytes = new Uint8Array([
    0xA0, 0x22,       // type 0 (PREIMAGE-SHA-256), length 34
    0x80, 0x20,       // preimage tag, length 32
    ...preimage
  ])

  return {
    condition: bytesToHex(conditionBytes),
    fulfillment: bytesToHex(fulfillmentBytes),
  }
}

// ─── Time Conversion Helpers ────────────────────────────────────────────────

/** Convert Unix timestamp (seconds) to Ripple epoch time */
export function unixToRippleTime(unixSeconds: number): number {
  return Math.floor(unixSeconds) - RIPPLE_EPOCH_OFFSET
}

/** Convert Ripple epoch time to Unix timestamp (seconds) */
export function rippleTimeToUnix(rippleTime: number): number {
  return rippleTime + RIPPLE_EPOCH_OFFSET
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
