// =============================================================================
// Transfer Document Generation & Hashing
// Generates signed transfer agreement PDFs and SHA-256 hashes.
// =============================================================================

import { jsPDF } from 'jspdf'
import type { TransferDocumentData } from '@/types'

// ─── SHA-256 Hashing ────────────────────────────────────────────────────────

/** Compute SHA-256 hash of arbitrary data, returns uppercase hex string */
export async function sha256Hash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as ArrayBufferView<ArrayBuffer>)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** Compute SHA-256 hash of a File object */
export async function sha256HashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return sha256Hash(new Uint8Array(buffer))
}

// ─── PDF Generation ─────────────────────────────────────────────────────────

/**
 * Generates a transfer agreement PDF document.
 * Returns the PDF as both raw bytes and a Blob for download.
 */
export function generateTransferDocument(data: TransferDocumentData): {
  pdfBytes: Uint8Array
  pdfBlob: Blob
} {
  const doc = new jsPDF()
  const margin = 20
  let y = margin

  const addLine = (text: string, fontSize = 10, bold = false) => {
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lines = doc.splitTextToSize(text, 170)
    if (y + lines.length * (fontSize * 0.5) > 280) {
      doc.addPage()
      y = margin
    }
    doc.text(lines, margin, y)
    y += lines.length * (fontSize * 0.5) + 2
  }

  const addSpace = (px = 6) => { y += px }

  // Title
  addLine('SHARE TRANSFER AGREEMENT', 16, true)
  addSpace(4)
  addLine(`Date: ${data.signatureDate}`, 10)
  addSpace(8)

  // Section 1: Transferor
  addLine('1. TRANSFEROR', 12, true)
  addSpace(2)
  addLine(`Name: ${data.transferorName}`)
  addLine(`XRPL Address: ${data.transferorAddress}`)
  addSpace(6)

  // Section 2: Share Details
  addLine('2. SHARE DETAILS', 12, true)
  addSpace(2)
  addLine(`Company: ${data.companyName}`)
  addLine(`Ticker Symbol: ${data.ticker}`)
  addLine(`Share Class: ${data.shareClass}`)
  addLine(`Number of Shares: ${data.shareAmount.toLocaleString()}`)
  addLine(`MPT Issuance ID: ${data.mptIssuanceId}`)
  addLine(`Jurisdiction: ${data.jurisdiction}`)
  addSpace(6)

  // Section 3: Transfer Terms
  addLine('3. TRANSFER TERMS', 12, true)
  addSpace(2)
  addLine(
    'The Transferor hereby irrevocably transfers and assigns all right, title, and interest ' +
    'in the above-described shares to the holder of the corresponding Multi-Purpose Token (MPT) ' +
    'on the XRP Ledger.'
  )
  addSpace(2)
  addLine(
    'The shares are permanently tied to the MPT tokens. Ownership of the MPT constitutes ' +
    'ownership of the underlying shares. Transfer of the MPT on the XRP Ledger (via DEX trade ' +
    'or direct transfer) constitutes transfer of the shares.'
  )
  addSpace(2)
  addLine(`Cashflow Distribution: ${data.cashflowPoolNote}`)
  addSpace(6)

  // Section 4: Governing Law
  addLine('4. GOVERNING LAW', 12, true)
  addSpace(2)
  addLine(
    `This agreement shall be governed by and construed in accordance with the laws of ${data.jurisdiction}.`
  )
  addSpace(10)

  // Section 5: Signature
  addLine('5. SIGNATURE', 12, true)
  addSpace(4)
  addLine(`Signed by: ${data.signatureName}`)
  addLine(`Date: ${data.signatureDate}`)
  addSpace(4)

  // Signature line
  doc.setDrawColor(100, 100, 100)
  doc.line(margin, y, margin + 80, y)
  y += 4
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Transferor Signature (Typed)', margin, y)

  const arrayBuffer = doc.output('arraybuffer')
  const pdfBytes = new Uint8Array(arrayBuffer)
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' })

  return { pdfBytes, pdfBlob }
}

/**
 * Generates a transfer document and computes its SHA-256 hash.
 * Returns the hash, PDF blob, and raw bytes.
 */
export async function generateAndHashDocument(data: TransferDocumentData): Promise<{
  hash: string
  pdfBlob: Blob
  pdfBytes: Uint8Array
}> {
  const { pdfBytes, pdfBlob } = generateTransferDocument(data)
  const hash = await sha256Hash(pdfBytes)
  return { hash, pdfBlob, pdfBytes }
}
