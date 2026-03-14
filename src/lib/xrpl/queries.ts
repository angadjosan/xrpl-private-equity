// =============================================================================
// Query Helpers — Read-only XRPL queries for MPT holders, escrows, offers
// All queries use client.request() with the appropriate WebSocket command.
// =============================================================================

import type { Client } from 'xrpl'
import type { MPTHolder, EscrowInfo } from '@/types'

// ─── MPT Holder Queries ─────────────────────────────────────────────────────

/**
 * Returns all holders of a given MPT issuance with their balances.
 * Uses ledger_data with type "mptoken" and paginates through all results.
 * Filters results to match the specified MPTokenIssuanceID.
 *
 * @param client - Connected XRPL client
 * @param mptIssuanceId - The MPTokenIssuanceID to query holders for
 * @returns Array of MPTHolder objects with account, balance, and flags
 */
export async function getMPTHolders(
  client: Client,
  mptIssuanceId: string
): Promise<MPTHolder[]> {
  const holders: MPTHolder[] = []
  let marker: unknown = undefined

  do {
    const request: Record<string, unknown> = {
      command: 'ledger_data',
      type: 'mptoken',
      limit: 100,
    }
    if (marker) request.marker = marker

    const response = await client.request(request)
    const state = (response.result as Record<string, unknown>).state as Array<Record<string, unknown>> | undefined

    if (state) {
      for (const entry of state) {
        if (entry.MPTokenIssuanceID === mptIssuanceId) {
          holders.push({
            account: entry.Account as string,
            balance: (entry.MPTAmount as string) ?? '0',
            flags: entry.Flags as number | undefined,
          })
        }
      }
    }

    marker = (response.result as Record<string, unknown>).marker
  } while (marker)

  return holders
}

// ─── Account MPT Queries ────────────────────────────────────────────────────

/**
 * Returns all MPTs held by a specific account.
 * Uses account_objects with type "mptoken" to find all MPToken objects
 * owned by the account.
 *
 * @param client - Connected XRPL client
 * @param address - The r-address to query
 * @returns Array of objects with mptIssuanceId and balance
 */
export async function getAccountMPTs(
  client: Client,
  address: string
): Promise<Array<{ mptIssuanceId: string; balance: string; flags?: number }>> {
  const response = await client.request({
    command: 'account_objects',
    account: address,
    type: 'mptoken',
  })

  const objects = (response.result as Record<string, unknown>).account_objects as Array<Record<string, unknown>>

  return (objects ?? []).map(obj => ({
    mptIssuanceId: obj.MPTokenIssuanceID as string,
    balance: (obj.MPTAmount as string) ?? '0',
    flags: obj.Flags as number | undefined,
  }))
}

// ─── MPT Issuance Queries ───────────────────────────────────────────────────

/**
 * Returns details of a specific MPT issuance.
 * Uses ledger_entry to fetch the MPTokenIssuance object by its ID.
 *
 * @param client - Connected XRPL client
 * @param mptIssuanceId - The MPTokenIssuanceID
 * @returns The issuance ledger object, or null if not found
 */
export async function getMPTIssuance(
  client: Client,
  mptIssuanceId: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await client.request({
      command: 'ledger_entry',
      mpt_issuance: mptIssuanceId,
    })
    return (response.result as Record<string, unknown>).node as Record<string, unknown>
  } catch {
    return null
  }
}

// ─── Escrow Queries ─────────────────────────────────────────────────────────

/**
 * Returns all pending escrows owned by an account.
 * Uses account_objects with type "escrow".
 * Parses both XRP and MPT escrow amounts.
 *
 * @param client - Connected XRPL client
 * @param address - The r-address to query (escrow owner/source)
 * @returns Array of EscrowInfo objects
 */
export async function getAccountEscrows(
  client: Client,
  address: string
): Promise<EscrowInfo[]> {
  const response = await client.request({
    command: 'account_objects',
    account: address,
    type: 'escrow',
  })

  const objects = (response.result as Record<string, unknown>).account_objects as Array<Record<string, unknown>>

  return (objects ?? []).map(obj => {
    const amount = obj.Amount as Record<string, unknown> | string
    const isMPT = typeof amount === 'object' && amount !== null

    return {
      owner: address,
      destination: obj.Destination as string,
      amount: isMPT ? (amount as Record<string, unknown>).value as string : amount as string,
      mptIssuanceId: isMPT ? (amount as Record<string, unknown>).mpt_issuance_id as string : '',
      condition: obj.Condition as string | undefined,
      cancelAfter: obj.CancelAfter as number | undefined,
      finishAfter: obj.FinishAfter as number | undefined,
      sequence: obj.Sequence as number,
    }
  })
}

// ─── DEX Offer Queries ──────────────────────────────────────────────────────

/**
 * Returns all DEX offers for an account.
 * Uses the account_offers command.
 *
 * @param client - Connected XRPL client
 * @param address - The r-address to query
 * @returns Array of offer objects from the XRPL response
 */
export async function getAccountOffers(
  client: Client,
  address: string
): Promise<Array<Record<string, unknown>>> {
  const response = await client.request({
    command: 'account_offers',
    account: address,
  })
  return (response.result as Record<string, unknown>).offers as Array<Record<string, unknown>> ?? []
}

// ─── Account Info ───────────────────────────────────────────────────────────

/**
 * Returns account info including balance, sequence number, and flags.
 * Uses the account_info command.
 *
 * @param client - Connected XRPL client
 * @param address - The r-address to query
 * @returns Account data object, or null if account not found
 */
export async function getAccountInfo(
  client: Client,
  address: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await client.request({
      command: 'account_info',
      account: address,
    })
    return (response.result as Record<string, unknown>).account_data as Record<string, unknown>
  } catch {
    return null
  }
}
