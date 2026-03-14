// Transfer document generation + SHA-256 hashing
import type { TransferDocumentData } from '@/types'

/** SHA-256 hash of arbitrary data, returns uppercase hex */
export async function sha256Hash(data: Uint8Array): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await crypto.subtle.digest('SHA-256', data as any)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** SHA-256 hash of a File */
export async function sha256HashFile(file: File): Promise<string> {
  return sha256Hash(new Uint8Array(await file.arrayBuffer()))
}

/** Generate a transfer agreement as plain text (no jsPDF dep) and return as blob + hash */
export async function generateTransferDocument(data: TransferDocumentData): Promise<{
  text: string
  blob: Blob
  hash: string
}> {
  const text = `
SHARE TRANSFER AGREEMENT
========================

Date: ${data.signatureDate}

1. TRANSFEROR
Name: ${data.transferorName}
XRPL Address: ${data.transferorAddress}

2. SHARE DETAILS
Company: ${data.companyName}
Ticker: ${data.ticker}
Share Class: ${data.shareClass}
Number of Shares: ${data.shareAmount.toLocaleString()}
MPT Issuance ID: ${data.mptIssuanceId}
Jurisdiction: ${data.jurisdiction}

3. TRANSFER TERMS
The Transferor hereby irrevocably transfers and assigns all right,
title, and interest in the above-described shares to the holder of
the corresponding Multi-Purpose Token (MPT) on the XRP Ledger.

The shares are permanently tied to the MPT tokens. Ownership of
the MPT constitutes ownership of the underlying shares. Transfer
of the MPT on the XRP Ledger constitutes transfer of the shares.

Cashflow Distribution: ${data.cashflowPoolNote}

4. GOVERNING LAW
This agreement shall be governed by the laws of ${data.jurisdiction}.

5. VERIFICATION
This document is subject to a ${data.verificationPeriodDays ?? 14}-day verification
period during which independent verifiers will validate the
authenticity of the share ownership claim. Verifiers stake XRP
as collateral to ensure honest verification.

6. SIGNATURE
Signed by: ${data.signatureName}
Date: ${data.signatureDate}

________________________________________
Transferor Signature (Digital)
`.trim()

  const bytes = new TextEncoder().encode(text)
  const blob = new Blob([bytes], { type: 'text/plain' })
  const hash = await sha256Hash(bytes)

  return { text, blob, hash }
}
