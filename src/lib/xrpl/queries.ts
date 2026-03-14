/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Query Helpers — Read-only XRPL queries for MPT holders, escrows, offers
// All queries use queryWithRetry for resilience against transient disconnects.
// =============================================================================

import type { Client } from 'xrpl'
import type { MPTHolder, EscrowInfo } from '@/types'
import { MAX_TX_RETRIES, RETRY_BASE_DELAY_MS } from '../constants'

/**
 * Retries a read-only query with exponential backoff on transient errors.
 * Retries on DisconnectedError / WebSocket failures, throws immediately on others.
 */
async function queryWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_TX_RETRIES
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const msg = error instanceof Error ? error.message : String(error)
      const isTransient =
        msg.includes('DisconnectedError') ||
        msg.includes('WebSocket') ||
        msg.includes('timeout')
      if (!isTransient || attempt >= maxRetries) throw error
      await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)))
    }
  }
  throw lastError
}

/** Returns all holders of a given MPT issuance with their balances.
 *  Uses ledger_data scoped to mptoken type with a page cap to avoid
 *  scanning the entire devnet. For large issuances, consider tracking
 *  holders via MPTokenAuthorize transaction history instead. */
export async function getMPTHolders(
  client: Client,
  mptIssuanceId: string
): Promise<MPTHolder[]> {
  return queryWithRetry(async () => {
    const holders: MPTHolder[] = []
    let marker: unknown = undefined
    const MAX_PAGES = 10 // cap at 1000 entries to avoid hanging on devnet

    let pages = 0
    do {
      const req: any = { command: 'ledger_data', type: 'mptoken', limit: 100 }
      if (marker) req.marker = marker

      const response = await client.request(req)
      const state = (response.result as any).state as any[] | undefined

      if (state) {
        for (const entry of state) {
          if (entry.MPTokenIssuanceID === mptIssuanceId) {
            holders.push({
              account: entry.Account,
              balance: entry.MPTAmount ?? '0',
              flags: entry.Flags,
            })
          }
        }
      }

      marker = (response.result as any).marker
      pages++
    } while (marker && pages < MAX_PAGES)

    return holders
  })
}

/** Returns all MPTs held by a specific account */
export async function getAccountMPTs(
  client: Client,
  address: string
): Promise<Array<{ mptIssuanceId: string; balance: string; flags?: number }>> {
  return queryWithRetry(async () => {
    const response = await client.request({
      command: 'account_objects',
      account: address,
      type: 'mptoken' as any,
    } as any)

    const objects = (response.result as any).account_objects ?? []
    return objects.map((obj: any) => ({
      mptIssuanceId: obj.MPTokenIssuanceID,
      balance: obj.MPTAmount ?? '0',
      flags: obj.Flags,
    }))
  })
}

/** Returns details of a specific MPT issuance */
export async function getMPTIssuance(
  client: Client,
  mptIssuanceId: string
): Promise<Record<string, unknown> | null> {
  return queryWithRetry(async () => {
    try {
      const response = await client.request({
        command: 'ledger_entry',
        mpt_issuance: mptIssuanceId,
      } as any)
      return (response.result as any).node
    } catch {
      return null
    }
  })
}

/** Returns all pending escrows owned by an account */
export async function getAccountEscrows(
  client: Client,
  address: string
): Promise<EscrowInfo[]> {
  return queryWithRetry(async () => {
    const response = await client.request({
      command: 'account_objects',
      account: address,
      type: 'escrow' as any,
    } as any)

    const objects = (response.result as any).account_objects ?? []
    return objects.map((obj: any) => {
      const amount = obj.Amount
      const isMPT = typeof amount === 'object' && amount !== null

      return {
        owner: address,
        destination: obj.Destination,
        amount: isMPT ? amount.value : amount,
        mptIssuanceId: isMPT ? amount.mpt_issuance_id : '',
        condition: obj.Condition,
        cancelAfter: obj.CancelAfter,
        finishAfter: obj.FinishAfter,
        sequence: obj.Sequence,
      }
    })
  })
}

/** Returns all DEX offers for an account */
export async function getAccountOffers(
  client: Client,
  address: string
): Promise<Array<Record<string, unknown>>> {
  return queryWithRetry(async () => {
    const response = await client.request({
      command: 'account_offers',
      account: address,
    })
    return (response.result as any).offers ?? []
  })
}

/** Returns account info (balance, sequence, etc.) */
export async function getAccountInfo(
  client: Client,
  address: string
): Promise<Record<string, unknown> | null> {
  return queryWithRetry(async () => {
    try {
      const response = await client.request({
        command: 'account_info',
        account: address,
      })
      return (response.result as any).account_data
    } catch {
      return null
    }
  })
}
