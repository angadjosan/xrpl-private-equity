// =============================================================================
// MPT Operations — Create, Authorize, Lock/Unlock, Clawback
// All operations use submitAndWait for confirmed ledger inclusion.
// =============================================================================

import type { Client, Wallet, TxResponse } from 'xrpl'
import type { MPTIssuanceConfig } from '@/types'
import { LSF_MPT_LOCKED } from '../constants'
import { submitWithRetry } from './client'

// ─── MPT Issuance Creation ──────────────────────────────────────────────────

/**
 * Creates a new MPT issuance on the XRPL.
 * Submits MPTokenIssuanceCreate with the provided configuration.
 * Flags are immutable after creation.
 *
 * @param client - Connected XRPL client
 * @param wallet - Issuer wallet that will own the issuance
 * @param config - Issuance configuration (assetScale, maximumAmount, transferFee, flags, metadata)
 * @returns Object containing the TxResponse and extracted MPTokenIssuanceID
 */
export async function createMPTIssuance(
  client: Client,
  wallet: Wallet,
  config: MPTIssuanceConfig
): Promise<{ result: TxResponse; mptIssuanceId: string }> {
  const tx: Record<string, unknown> = {
    TransactionType: 'MPTokenIssuanceCreate',
    Account: wallet.address,
    AssetScale: config.assetScale,
    MaximumAmount: config.maximumAmount,
    TransferFee: config.transferFee,
    Flags: config.flags,
  }

  if (config.metadata) {
    tx.MPTokenMetadata = config.metadata
  }

  const result = await submitWithRetry(client, tx, wallet)
  const mptIssuanceId = extractMPTIssuanceID(result)

  return { result, mptIssuanceId }
}

/**
 * Extracts the MPTokenIssuanceID from a createMPTIssuance result.
 * Parses AffectedNodes in the transaction metadata to find the
 * CreatedNode of type MPTokenIssuance.
 *
 * @param result - TxResponse from createMPTIssuance
 * @returns MPTokenIssuanceID hex string
 * @throws Error if ID cannot be extracted from metadata
 */
export function extractMPTIssuanceID(result: TxResponse): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = result.result.meta as any
  if (typeof meta === 'object' && meta !== null) {
    // Check for mpt_issuance_id directly on meta (some xrpl.js versions)
    if (meta.mpt_issuance_id) {
      return meta.mpt_issuance_id as string
    }

    const affectedNodes = (meta as { AffectedNodes?: Array<Record<string, unknown>> }).AffectedNodes
    if (affectedNodes) {
      for (const node of affectedNodes) {
        const created = node.CreatedNode as Record<string, unknown> | undefined
        if (created?.LedgerEntryType === 'MPTokenIssuance') {
          const newFields = created.NewFields as Record<string, unknown>
          if (newFields?.MPTokenIssuanceID) {
            return newFields.MPTokenIssuanceID as string
          }
          // Some versions use the ledger index as the ID
          if (created.LedgerIndex) {
            return created.LedgerIndex as string
          }
        }
      }
    }
  }

  // Fallback: construct from account + sequence (for debugging/dev)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txResult = result.result as any
  const account = txResult.Account as string
  const sequence = txResult.Sequence as number
  throw new Error(
    `Could not extract MPTokenIssuanceID from transaction result. ` +
    `Account: ${account}, Sequence: ${sequence}. ` +
    `Check the transaction metadata for the created issuance.`
  )
}

// ─── MPT Authorization ──────────────────────────────────────────────────────

/**
 * Issuer authorizes a holder address to hold the MPT.
 * Required when tfMPTRequireAuth is set on the issuance.
 * The issuer submits MPTokenAuthorize with the Holder field set.
 *
 * @param client - Connected XRPL client
 * @param issuerWallet - Issuer wallet (must be the issuance creator)
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param holderAddress - The r-address to authorize
 * @returns TxResponse
 */
export async function authorizeMPTHolder(
  client: Client,
  issuerWallet: Wallet,
  mptIssuanceId: string,
  holderAddress: string
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'MPTokenAuthorize',
    Account: issuerWallet.address,
    MPTokenIssuanceID: mptIssuanceId,
    Holder: holderAddress,
  }
  return submitWithRetry(client, tx, issuerWallet)
}

/**
 * Holder self-authorizes (opts in) to hold an MPT.
 * The holder submits MPTokenAuthorize from their own account without a Holder field.
 * This creates the MPToken ledger object on the holder's account.
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
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'MPTokenAuthorize',
    Account: holderWallet.address,
    MPTokenIssuanceID: mptIssuanceId,
  }
  return submitWithRetry(client, tx, holderWallet)
}

// ─── MPT Lock/Unlock ────────────────────────────────────────────────────────

/**
 * Locks (freezes) an MPT globally or for a specific holder.
 * Requires tfMPTCanLock (0x02) to be set on the issuance.
 * Uses MPTokenIssuanceSet with Flags: lsfMPTLocked (0x0001).
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
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'MPTokenIssuanceSet',
    Account: issuerWallet.address,
    MPTokenIssuanceID: mptIssuanceId,
    Flags: LSF_MPT_LOCKED,
  }
  if (holderAddress) {
    tx.Holder = holderAddress
  }
  return submitWithRetry(client, tx, issuerWallet)
}

/**
 * Unlocks an MPT globally or for a specific holder.
 * Uses MPTokenIssuanceSet with Flags: 0 (removes lock flag).
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
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'MPTokenIssuanceSet',
    Account: issuerWallet.address,
    MPTokenIssuanceID: mptIssuanceId,
    Flags: 0,
  }
  if (holderAddress) {
    tx.Holder = holderAddress
  }
  return submitWithRetry(client, tx, issuerWallet)
}

// ─── MPT Clawback ───────────────────────────────────────────────────────────

/**
 * Claws back MPTs from a holder.
 * Requires tfMPTCanClawback (0x40) to be set on the issuance.
 * Submits a Clawback transaction from the issuer account.
 *
 * @param client - Connected XRPL client
 * @param issuerWallet - Issuer wallet
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @param holderAddress - Address to claw back from (set as "issuer" in Amount)
 * @param amount - Amount to claw back as string
 * @returns TxResponse
 */
export async function clawbackMPT(
  client: Client,
  issuerWallet: Wallet,
  mptIssuanceId: string,
  holderAddress: string,
  amount: string
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'Clawback',
    Account: issuerWallet.address,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value: amount,
      issuer: holderAddress,
    },
  }
  return submitWithRetry(client, tx, issuerWallet)
}
