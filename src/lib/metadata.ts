import type { CreateTokenForm, EquityMetadata } from '@/types'
import { MAX_METADATA_BYTES } from './constants'

/** Builds XLS-89 metadata from form data with equity-specific ai fields */
export function buildMetadata(form: CreateTokenForm): EquityMetadata {
  const metadata: EquityMetadata = {
    t: form.ticker.toUpperCase(),
    n: form.companyName,
    ac: 'rwa',
    as: 'equity',
  }

  if (form.description) metadata.d = form.description

  // Build additional_info with all equity proof fields
  const ai: Record<string, string> = {}
  if (form.shareClass) ai.share_class = form.shareClass
  if (form.parValue) ai.par_value = form.parValue
  if (form.jurisdiction) ai.jurisdiction = form.jurisdiction
  if (form.entityType) ai.entity_type = form.entityType
  if (form.registrationNumber) ai.registration_number = form.registrationNumber
  if (form.proofType) ai.proof_type = form.proofType
  if (form.proofReference) ai.proof_reference = form.proofReference
  if (form.transferAgent) ai.transfer_agent = form.transferAgent
  if (form.cusip) ai.cusip = form.cusip
  if (form.exemption) ai.governing_law = form.exemption
  if (form.cashflowCurrency) ai.cashflow_currency = form.cashflowCurrency
  if (form.distributionFrequency) ai.distribution_frequency = form.distributionFrequency
  if (form.verificationPeriodDays) ai.verification_period_days = String(form.verificationPeriodDays)
  ai.cashflow_pool = 'protocol'

  if (Object.keys(ai).length > 0) {
    metadata.ai = ai
  }

  return metadata
}

/** Encode metadata to uppercase hex string for MPTokenMetadata field */
export function encodeMetadataHex(metadata: EquityMetadata): string {
  const json = JSON.stringify(metadata)
  const bytes = new TextEncoder().encode(json)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** Decode hex metadata back to object */
export function decodeMetadataHex(hex: string): EquityMetadata {
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  )
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Get byte size of metadata when JSON-encoded */
export function getMetadataSize(metadata: EquityMetadata): number {
  return new TextEncoder().encode(JSON.stringify(metadata)).length
}

/** Validate metadata fits within 1024 byte XLS-89 limit */
export function validateMetadata(metadata: EquityMetadata): { valid: boolean; size: number; error?: string } {
  const size = getMetadataSize(metadata)
  if (size > MAX_METADATA_BYTES) {
    return { valid: false, size, error: `Metadata is ${size} bytes, exceeding the ${MAX_METADATA_BYTES} byte limit.` }
  }
  return { valid: true, size }
}

/** Build + validate + encode in one call */
export function buildMetadataHex(form: CreateTokenForm): { hex: string; size: number; error?: string } {
  const metadata = buildMetadata(form)
  const validation = validateMetadata(metadata)
  if (!validation.valid) {
    return { hex: '', size: validation.size, error: validation.error }
  }
  return { hex: encodeMetadataHex(metadata), size: validation.size }
}
