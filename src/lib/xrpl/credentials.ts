// XRPL Credentials (XLS-70) for share verification
import type { Client, Wallet, TxResponse } from 'xrpl'
import type { CredentialInfo } from '@/types'
import { submitWithRetry } from './client'

function stringToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function hexToString(hex: string): string {
  return new TextDecoder().decode(
    new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  )
}

/** Verifier issues a credential to a registrant (share verified) */
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
  if (uri) tx.URI = stringToHex(uri)
  return submitWithRetry(client, tx, verifierWallet)
}

/** Subject accepts a credential */
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

/** Check if credential exists */
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
      subject: node.Subject,
      issuer: node.Issuer,
      credentialType,
      uri: node.URI ? hexToString(node.URI) : undefined,
      accepted: !!(node.Flags & 0x00010000),
    }
  } catch {
    return null
  }
}
