// =============================================================================
// XLS-89 Metadata Encoding/Decoding
// Builds equity metadata JSON from form data, encodes to hex for on-chain storage.
// Maximum size: 1024 bytes.
// =============================================================================

import type { CreateTokenForm, EquityMetadata } from '@/types'
import { MAX_METADATA_BYTES } from './constants'

// ─── Metadata Builder ───────────────────────────────────────────────────────

/**
 * Builds an XLS-89 metadata object from the Create Token form data.
 * Uses compressed keys per the XLS-89 spec:
 *   t = ticker, n = name, d = description, ac = asset_class,
 *   as = asset_subclass, i = icon, in = issuer_name, us = weblinks,
 *   ai = additional_info
 *
 * @param form - Create Token form data
 * @returns EquityMetadata object with compressed keys
 */
export function buildMetadata(form: CreateTokenForm): EquityMetadata {
  const metadata: EquityMetadata = {
    t: form.ticker.toUpperCase(),
    n: form.companyName,
    ac: 'rwa',
    as: 'equity',
  }

  if (form.description) metadata.d = form.description
  if (form.companyWebsite) {
    metadata.us = [{ u: form.companyWebsite, t: 'Company Website' }]
  }

  // Build additional_info from equity-specific fields
  metadata.ai = {}
  if (form.shareClass) metadata.ai.share_class = form.shareClass
  if (form.parValue) metadata.ai.par_value = form.parValue
  if (form.cashflowCurrency) metadata.ai.cashflow_currency = form.cashflowCurrency
  if (form.cashflowToken) metadata.ai.cashflow_token = form.cashflowToken
  if (form.distributionFrequency) metadata.ai.distribution_frequency = form.distributionFrequency
  if (form.jurisdiction) metadata.ai.jurisdiction = form.jurisdiction

  // Remove empty ai object to save bytes
  if (Object.keys(metadata.ai).length === 0) {
    delete metadata.ai
  }

  return metadata
}

// ─── Hex Encoding/Decoding ──────────────────────────────────────────────────

/**
 * Encodes a metadata object to an uppercase hex string for the MPTokenMetadata field.
 * JSON.stringify -> UTF-8 bytes -> hex pairs.
 *
 * @param metadata - EquityMetadata object
 * @returns Uppercase hex string
 */
export function encodeMetadataHex(metadata: EquityMetadata): string {
  const json = JSON.stringify(metadata)
  const encoder = new TextEncoder()
  const bytes = encoder.encode(json)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/**
 * Decodes a hex-encoded metadata string back to the original JSON object.
 * Hex pairs -> bytes -> UTF-8 string -> JSON.parse.
 *
 * @param hex - Hex string from MPTokenMetadata
 * @returns Parsed EquityMetadata object with compressed keys
 */
export function decodeMetadataHex(hex: string): EquityMetadata {
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  )
  const decoder = new TextDecoder()
  const json = decoder.decode(bytes)
  return JSON.parse(json)
}

// ─── Size Validation ────────────────────────────────────────────────────────

/**
 * Returns the byte size of the metadata when JSON-encoded.
 * This is the size that will be stored on-chain (before hex encoding).
 *
 * @param metadata - EquityMetadata object
 * @returns Byte count of the JSON-encoded metadata
 */
export function getMetadataSize(metadata: EquityMetadata): number {
  const json = JSON.stringify(metadata)
  return new TextEncoder().encode(json).length
}

/**
 * Validates that metadata fits within the 1024 byte XLS-89 limit.
 *
 * @param metadata - EquityMetadata object
 * @returns Object with valid flag, size, and optional error message
 */
export function validateMetadata(metadata: EquityMetadata): { valid: boolean; size: number; error?: string } {
  const size = getMetadataSize(metadata)
  if (size > MAX_METADATA_BYTES) {
    return {
      valid: false,
      size,
      error: `Metadata is ${size} bytes, exceeding the ${MAX_METADATA_BYTES} byte limit. Reduce description or other fields.`,
    }
  }
  return { valid: true, size }
}

/**
 * Builds hex-encoded metadata from form data with size validation.
 * Convenience function that combines buildMetadata + validateMetadata + encodeMetadataHex.
 *
 * @param form - Create Token form data
 * @returns Object with hex string, byte size, and optional error message
 */
export function buildMetadataHex(form: CreateTokenForm): { hex: string; size: number; error?: string } {
  const metadata = buildMetadata(form)
  const validation = validateMetadata(metadata)
  if (!validation.valid) {
    return { hex: '', size: validation.size, error: validation.error }
  }
  return { hex: encodeMetadataHex(metadata), size: validation.size }
}
