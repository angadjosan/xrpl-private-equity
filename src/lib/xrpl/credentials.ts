// =============================================================================
// XRPL Credentials (XLS-0070)
// Create, accept, and check credentials for share ownership verification.
// =============================================================================

import type { Client, Wallet, TxResponse } from 'xrpl'
import type { CredentialInfo } from '@/types'
import { submitWithRetry } from './client'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Encode a string to uppercase hex */
export function stringToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// ─── Credential Create ──────────────────────────────────────────────────────

/**
 * Verifier issues a credential to a subject (share registrant).
 * Uses CredentialCreate (XLS-0070).
 */
export async function createCredential(
  client: Client,
  verifierWallet: Wallet,
  subjectAddress: string,
  credentialType: string,
  uri?: string
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'CredentialCreate',
    Account: verifierWallet.address,
    Subject: subjectAddress,
    CredentialType: stringToHex(credentialType),
  }
  if (uri) {
    tx.URI = stringToHex(uri)
  }
  return submitWithRetry(client, tx, verifierWallet)
}

// ─── Credential Accept ──────────────────────────────────────────────────────

/**
 * Subject accepts a credential issued to them.
 * Uses CredentialAccept (XLS-0070).
 */
export async function acceptCredential(
  client: Client,
  subjectWallet: Wallet,
  issuerAddress: string,
  credentialType: string
): Promise<TxResponse> {
  const tx: Record<string, unknown> = {
    TransactionType: 'CredentialAccept',
    Account: subjectWallet.address,
    Issuer: issuerAddress,
    CredentialType: stringToHex(credentialType),
  }
  return submitWithRetry(client, tx, subjectWallet)
}

// ─── Credential Check ───────────────────────────────────────────────────────

/**
 * Checks if a credential exists on-ledger for a given subject/issuer/type.
 * Returns credential info if found, null otherwise.
 */
export async function checkCredential(
  client: Client,
  subjectAddress: string,
  issuerAddress: string,
  credentialType: string
): Promise<CredentialInfo | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.request({
      command: 'ledger_entry',
      credential: {
        subject: subjectAddress,
        issuer: issuerAddress,
        credential_type: stringToHex(credentialType),
      },
    } as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (response.result as any).node
    if (!node) return null

    return {
      subject: node.Subject as string,
      issuer: node.Issuer as string,
      credentialType,
      uri: node.URI ? hexToString(node.URI as string) : undefined,
      accepted: !!(node.Flags & 0x00010000), // lsfAccepted
    }
  } catch {
    // Credential not found or query failed
    return null
  }
}

/** Decode hex string back to UTF-8 */
function hexToString(hex: string): string {
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  )
  return new TextDecoder().decode(bytes)
}
