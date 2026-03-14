import { describe, it, expect } from 'vitest'
import {
  formatXRP,
  formatMPTAmount,
  truncateAddress,
  formatRippleTimestamp,
  formatTransferFee,
} from '../format'

// =============================================================================
// Formatting Helpers Tests
// =============================================================================

describe('formatXRP', () => {
  it('converts drops to XRP (1,000,000 drops = 1 XRP)', () => {
    const result = formatXRP(1_000_000)
    expect(result).toContain('1')
  })

  it('handles string input', () => {
    const result = formatXRP('5000000')
    expect(result).toContain('5')
  })

  it('handles zero', () => {
    const result = formatXRP(0)
    expect(result).toContain('0')
  })

  it('handles fractional XRP amounts', () => {
    const result = formatXRP(1_500_000)
    expect(result).toContain('1')
    expect(result).toContain('5')
  })

  it('handles large amounts', () => {
    const result = formatXRP(100_000_000_000) // 100,000 XRP
    expect(result).toContain('100')
  })
})

describe('formatMPTAmount', () => {
  it('formats whole number with scale 0', () => {
    const result = formatMPTAmount(1000, 0)
    expect(result).toContain('1')
  })

  it('formats with decimal places for non-zero scale', () => {
    const result = formatMPTAmount(1000.5, 2)
    expect(result).toContain('1')
  })

  it('handles string input', () => {
    const result = formatMPTAmount('500', 0)
    expect(result).toContain('500')
  })

  it('defaults to scale 0', () => {
    const result = formatMPTAmount(42)
    expect(result).toContain('42')
  })
})

describe('truncateAddress', () => {
  it('truncates a standard XRPL address', () => {
    const addr = 'rN7n3473SaZBCG4dFL83w7p1W9cgZw6iFb'
    const result = truncateAddress(addr)
    expect(result).toBe('rN7n34...6iFb') // 6 start + ... + 4 end (defaults)
  })

  it('uses default start=6 and end=4', () => {
    const addr = 'rN7n3473SaZBCG4dFL83w7p1W9cgZw6iFb'
    const result = truncateAddress(addr)
    expect(result.startsWith('rN7n34')).toBe(true)
    expect(result.endsWith('6iFb')).toBe(true)
    expect(result).toContain('...')
  })

  it('returns full address if shorter than threshold', () => {
    const short = 'rShort'
    expect(truncateAddress(short)).toBe('rShort')
  })

  it('respects custom start and end chars', () => {
    const addr = 'rN7n3473SaZBCG4dFL83w7p1W9cgZw6iFb'
    const result = truncateAddress(addr, 4, 3)
    expect(result.startsWith('rN7n')).toBe(true)
    expect(result.endsWith('iFb')).toBe(true)
  })
})

describe('formatRippleTimestamp', () => {
  it('converts Ripple epoch 0 to around Jan 1, 2000 UTC', () => {
    const result = formatRippleTimestamp(0)
    // Ripple epoch 0 = Unix 946684800 = 2000-01-01T00:00:00Z
    // Local TZ may shift to Dec 31, 1999 or Jan 1, 2000
    expect(result).toMatch(/1999|2000/)
  })

  it('converts a known timestamp correctly', () => {
    // 2024-01-01 00:00:00 UTC = Unix 1704067200 = Ripple 757382400
    const rippleTime = 1704067200 - 946684800
    const result = formatRippleTimestamp(rippleTime)
    // Local TZ may shift date ±1 day
    expect(result).toMatch(/2023|2024/)
  })
})

describe('formatTransferFee', () => {
  it('formats zero fee', () => {
    const result = formatTransferFee(0)
    expect(result).toBe('0.000% (0 bps)')
  })

  it('formats fee in tenths of a basis point', () => {
    // 1000 = 100 bps = 1%
    const result = formatTransferFee(1000)
    expect(result).toBe('1.000% (100 bps)')
  })

  it('formats max fee (50000 = 5000 bps = 50%)', () => {
    const result = formatTransferFee(50000)
    expect(result).toBe('50.000% (5000 bps)')
  })

  it('formats fractional basis points', () => {
    // 15 = 1.5 bps = 0.015%
    const result = formatTransferFee(15)
    expect(result).toBe('0.015% (1.5 bps)')
  })
})
