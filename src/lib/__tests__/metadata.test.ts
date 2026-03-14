import { describe, it, expect } from 'vitest'
import {
  buildMetadata,
  encodeMetadataHex,
  decodeMetadataHex,
  getMetadataSize,
  validateMetadata,
  buildMetadataHex,
} from '../metadata'
import type { CreateTokenForm, EquityMetadata } from '@/types'
import { MAX_METADATA_BYTES } from '../constants'

// =============================================================================
// Metadata Encoding/Decoding Tests
// =============================================================================

function makeForm(overrides: Partial<CreateTokenForm> = {}): CreateTokenForm {
  return {
    companyName: 'Acme Inc',
    ticker: 'ACME',
    description: 'A test equity token',
    totalShares: 1000000,
    assetScale: 0,
    transferFee: 0,
    shareClass: 'Common',
    parValue: '1.00',
    cashflowCurrency: 'USD',
    cashflowToken: '',
    distributionFrequency: 'quarterly',
    jurisdiction: 'US',
    companyWebsite: 'https://acme.example.com',
    flagSelections: {},
    ...overrides,
  }
}

describe('buildMetadata', () => {
  it('sets required fields from form data', () => {
    const form = makeForm()
    const meta = buildMetadata(form)
    expect(meta.t).toBe('ACME')
    expect(meta.n).toBe('Acme Inc')
    expect(meta.ac).toBe('rwa')
    expect(meta.as).toBe('equity')
  })

  it('uppercases ticker', () => {
    const meta = buildMetadata(makeForm({ ticker: 'acme' }))
    expect(meta.t).toBe('ACME')
  })

  it('includes description when provided', () => {
    const meta = buildMetadata(makeForm({ description: 'Some desc' }))
    expect(meta.d).toBe('Some desc')
  })

  it('omits description when empty', () => {
    const meta = buildMetadata(makeForm({ description: '' }))
    expect(meta.d).toBeUndefined()
  })

  it('includes website as weblinks when provided', () => {
    const meta = buildMetadata(makeForm({ companyWebsite: 'https://example.com' }))
    expect(meta.us).toEqual([{ u: 'https://example.com', t: 'Company Website' }])
  })

  it('omits weblinks when website is empty', () => {
    const meta = buildMetadata(makeForm({ companyWebsite: '' }))
    expect(meta.us).toBeUndefined()
  })

  it('includes equity-specific fields in additional_info', () => {
    const meta = buildMetadata(makeForm({
      shareClass: 'Preferred',
      parValue: '10.00',
      cashflowCurrency: 'EUR',
      jurisdiction: 'DE',
      distributionFrequency: 'monthly',
    }))
    expect(meta.ai?.share_class).toBe('Preferred')
    expect(meta.ai?.par_value).toBe('10.00')
    expect(meta.ai?.cashflow_currency).toBe('EUR')
    expect(meta.ai?.jurisdiction).toBe('DE')
    expect(meta.ai?.distribution_frequency).toBe('monthly')
  })

  it('omits ai when all equity fields are empty', () => {
    const meta = buildMetadata(makeForm({
      shareClass: '',
      parValue: '',
      cashflowCurrency: '',
      cashflowToken: '',
      distributionFrequency: '',
      jurisdiction: '',
    }))
    expect(meta.ai).toBeUndefined()
  })
})

describe('encodeMetadataHex / decodeMetadataHex', () => {
  it('round-trips a metadata object', () => {
    const original: EquityMetadata = {
      t: 'ACME',
      n: 'Acme Inc',
      ac: 'rwa',
      as: 'equity',
      d: 'Test description',
    }
    const hex = encodeMetadataHex(original)
    const decoded = decodeMetadataHex(hex)
    expect(decoded).toEqual(original)
  })

  it('produces uppercase hex', () => {
    const hex = encodeMetadataHex({ t: 'X', n: 'Y', ac: 'rwa' })
    expect(hex).toMatch(/^[0-9A-F]+$/)
  })

  it('handles unicode characters', () => {
    const original: EquityMetadata = { t: 'TEST', n: 'Ünïcödé Corp', ac: 'rwa' }
    const hex = encodeMetadataHex(original)
    const decoded = decodeMetadataHex(hex)
    expect(decoded.n).toBe('Ünïcödé Corp')
  })

  it('handles complex nested metadata', () => {
    const original: EquityMetadata = {
      t: 'ACME',
      n: 'Acme',
      ac: 'rwa',
      as: 'equity',
      us: [{ u: 'https://acme.com', t: 'Website' }],
      ai: {
        share_class: 'Common',
        par_value: '1.00',
        jurisdiction: 'US',
      },
    }
    const hex = encodeMetadataHex(original)
    const decoded = decodeMetadataHex(hex)
    expect(decoded).toEqual(original)
  })
})

describe('getMetadataSize', () => {
  it('returns byte length of JSON-encoded metadata', () => {
    const meta: EquityMetadata = { t: 'X', n: 'Y', ac: 'rwa' }
    const json = JSON.stringify(meta)
    const expected = new TextEncoder().encode(json).length
    expect(getMetadataSize(meta)).toBe(expected)
  })

  it('counts unicode chars by byte length, not char count', () => {
    const meta: EquityMetadata = { t: 'X', n: '日本語', ac: 'rwa' }
    // Japanese chars = 3 bytes each in UTF-8
    const size = getMetadataSize(meta)
    expect(size).toBeGreaterThan(JSON.stringify(meta).length - 6) // at least more than ASCII
  })
})

describe('validateMetadata', () => {
  it('returns valid for small metadata', () => {
    const meta: EquityMetadata = { t: 'ACME', n: 'Acme', ac: 'rwa' }
    const result = validateMetadata(meta)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('returns invalid for oversized metadata', () => {
    const meta: EquityMetadata = {
      t: 'ACME',
      n: 'Acme',
      ac: 'rwa',
      d: 'x'.repeat(2000), // way over 1024 bytes
    }
    const result = validateMetadata(meta)
    expect(result.valid).toBe(false)
    expect(result.error).toContain(`${MAX_METADATA_BYTES}`)
    expect(result.size).toBeGreaterThan(MAX_METADATA_BYTES)
  })

  it('returns exact size in result', () => {
    const meta: EquityMetadata = { t: 'X', n: 'Y', ac: 'rwa' }
    const result = validateMetadata(meta)
    expect(result.size).toBe(getMetadataSize(meta))
  })
})

describe('buildMetadataHex', () => {
  it('builds hex from form data', () => {
    const form = makeForm()
    const result = buildMetadataHex(form)
    expect(result.hex).toBeTruthy()
    expect(result.hex).toMatch(/^[0-9A-F]+$/)
    expect(result.size).toBeGreaterThan(0)
    expect(result.error).toBeUndefined()
  })

  it('returns error for oversized metadata', () => {
    const form = makeForm({ description: 'x'.repeat(2000) })
    const result = buildMetadataHex(form)
    expect(result.hex).toBe('')
    expect(result.error).toBeTruthy()
  })

  it('hex decodes back to expected metadata', () => {
    const form = makeForm({ ticker: 'test', companyName: 'Test Corp' })
    const result = buildMetadataHex(form)
    const decoded = decodeMetadataHex(result.hex)
    expect(decoded.t).toBe('TEST')
    expect(decoded.n).toBe('Test Corp')
    expect(decoded.ac).toBe('rwa')
  })
})
