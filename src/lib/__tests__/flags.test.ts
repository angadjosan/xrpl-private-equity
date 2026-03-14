import { describe, it, expect } from 'vitest'
import {
  MPT_FLAGS,
  computeFlags,
  validateFlags,
  getDefaultFlagSelections,
  applyFlagDependencies,
} from '../flags'
import type { FlagSelections } from '@/types'

// =============================================================================
// MPT Flag System Tests
// =============================================================================

describe('MPT_FLAGS', () => {
  it('has exactly 6 flags', () => {
    expect(MPT_FLAGS).toHaveLength(6)
  })

  it('contains all expected flag keys', () => {
    const keys = MPT_FLAGS.map(f => f.key)
    expect(keys).toContain('tfMPTCanTransfer')
    expect(keys).toContain('tfMPTCanEscrow')
    expect(keys).toContain('tfMPTCanTrade')
    expect(keys).toContain('tfMPTRequireAuth')
    expect(keys).toContain('tfMPTCanLock')
    expect(keys).toContain('tfMPTCanClawback')
  })

  it('has correct hex values per XLS-33 spec', () => {
    const flagMap = Object.fromEntries(MPT_FLAGS.map(f => [f.key, f.hex]))
    expect(flagMap.tfMPTCanLock).toBe(0x02)
    expect(flagMap.tfMPTRequireAuth).toBe(0x04)
    expect(flagMap.tfMPTCanEscrow).toBe(0x08)
    expect(flagMap.tfMPTCanTrade).toBe(0x10)
    expect(flagMap.tfMPTCanTransfer).toBe(0x20)
    expect(flagMap.tfMPTCanClawback).toBe(0x40)
  })

  it('defines escrow and trade as dependents of transfer', () => {
    const transfer = MPT_FLAGS.find(f => f.key === 'tfMPTCanTransfer')!
    expect(transfer.dependents).toContain('tfMPTCanEscrow')
    expect(transfer.dependents).toContain('tfMPTCanTrade')
  })

  it('defines transfer as dependency of escrow and trade', () => {
    const escrow = MPT_FLAGS.find(f => f.key === 'tfMPTCanEscrow')!
    const trade = MPT_FLAGS.find(f => f.key === 'tfMPTCanTrade')!
    expect(escrow.dependencies).toContain('tfMPTCanTransfer')
    expect(trade.dependencies).toContain('tfMPTCanTransfer')
  })

  it('all flags default to true', () => {
    for (const flag of MPT_FLAGS) {
      expect(flag.default).toBe(true)
    }
  })
})

describe('computeFlags', () => {
  it('returns 0 when no flags selected', () => {
    const sel: FlagSelections = {
      tfMPTCanLock: false,
      tfMPTRequireAuth: false,
      tfMPTCanEscrow: false,
      tfMPTCanTrade: false,
      tfMPTCanTransfer: false,
      tfMPTCanClawback: false,
    }
    expect(computeFlags(sel)).toBe(0)
  })

  it('returns correct value for all flags ON (0x7E = 126)', () => {
    const sel: FlagSelections = {
      tfMPTCanLock: true,
      tfMPTRequireAuth: true,
      tfMPTCanEscrow: true,
      tfMPTCanTrade: true,
      tfMPTCanTransfer: true,
      tfMPTCanClawback: true,
    }
    expect(computeFlags(sel)).toBe(0x7E)
    expect(computeFlags(sel)).toBe(126)
  })

  it('returns correct value for single flag', () => {
    expect(computeFlags({ tfMPTCanTransfer: true })).toBe(0x20)
    expect(computeFlags({ tfMPTCanLock: true })).toBe(0x02)
    expect(computeFlags({ tfMPTCanClawback: true })).toBe(0x40)
  })

  it('correctly OR-combines multiple flags', () => {
    const sel: FlagSelections = {
      tfMPTCanTransfer: true,
      tfMPTCanEscrow: true,
    }
    expect(computeFlags(sel)).toBe(0x20 | 0x08) // 40
  })

  it('ignores unknown keys in selections', () => {
    const sel: FlagSelections = {
      tfMPTCanTransfer: true,
      unknownFlag: true,
    }
    expect(computeFlags(sel)).toBe(0x20)
  })
})

describe('validateFlags', () => {
  it('returns empty array when all flags are valid', () => {
    const sel = getDefaultFlagSelections()
    expect(validateFlags(sel)).toEqual([])
  })

  it('returns empty array when no flags selected', () => {
    const sel: FlagSelections = {
      tfMPTCanLock: false,
      tfMPTRequireAuth: false,
      tfMPTCanEscrow: false,
      tfMPTCanTrade: false,
      tfMPTCanTransfer: false,
      tfMPTCanClawback: false,
    }
    expect(validateFlags(sel)).toEqual([])
  })

  it('returns error when escrow is ON but transfer is OFF', () => {
    const sel: FlagSelections = {
      tfMPTCanEscrow: true,
      tfMPTCanTransfer: false,
    }
    const errors = validateFlags(sel)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Allow Token Escrow')
    expect(errors[0]).toContain('Allow Transfers')
  })

  it('returns error when trade is ON but transfer is OFF', () => {
    const sel: FlagSelections = {
      tfMPTCanTrade: true,
      tfMPTCanTransfer: false,
    }
    const errors = validateFlags(sel)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Allow DEX Trading')
    expect(errors[0]).toContain('Allow Transfers')
  })

  it('returns two errors when both escrow and trade are ON but transfer is OFF', () => {
    const sel: FlagSelections = {
      tfMPTCanEscrow: true,
      tfMPTCanTrade: true,
      tfMPTCanTransfer: false,
    }
    const errors = validateFlags(sel)
    expect(errors).toHaveLength(2)
  })
})

describe('getDefaultFlagSelections', () => {
  it('returns all flags set to true', () => {
    const sel = getDefaultFlagSelections()
    for (const flag of MPT_FLAGS) {
      expect(sel[flag.key]).toBe(true)
    }
  })

  it('returns a new object each time', () => {
    const a = getDefaultFlagSelections()
    const b = getDefaultFlagSelections()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})

describe('applyFlagDependencies', () => {
  it('disables escrow and trade when transfer is turned OFF', () => {
    const sel: FlagSelections = {
      tfMPTCanTransfer: false,
      tfMPTCanEscrow: true,
      tfMPTCanTrade: true,
    }
    const result = applyFlagDependencies(sel, 'tfMPTCanTransfer')
    expect(result.tfMPTCanEscrow).toBe(false)
    expect(result.tfMPTCanTrade).toBe(false)
  })

  it('enables transfer when escrow is turned ON', () => {
    const sel: FlagSelections = {
      tfMPTCanTransfer: false,
      tfMPTCanEscrow: true,
    }
    const result = applyFlagDependencies(sel, 'tfMPTCanEscrow')
    expect(result.tfMPTCanTransfer).toBe(true)
  })

  it('enables transfer when trade is turned ON', () => {
    const sel: FlagSelections = {
      tfMPTCanTransfer: false,
      tfMPTCanTrade: true,
    }
    const result = applyFlagDependencies(sel, 'tfMPTCanTrade')
    expect(result.tfMPTCanTransfer).toBe(true)
  })

  it('does not modify unrelated flags', () => {
    const sel: FlagSelections = {
      tfMPTCanTransfer: false,
      tfMPTCanEscrow: true,
      tfMPTCanTrade: true,
      tfMPTCanLock: true,
      tfMPTRequireAuth: true,
      tfMPTCanClawback: true,
    }
    const result = applyFlagDependencies(sel, 'tfMPTCanTransfer')
    expect(result.tfMPTCanLock).toBe(true)
    expect(result.tfMPTRequireAuth).toBe(true)
    expect(result.tfMPTCanClawback).toBe(true)
  })

  it('returns a new object, does not mutate input', () => {
    const sel: FlagSelections = { tfMPTCanTransfer: false, tfMPTCanEscrow: true }
    const result = applyFlagDependencies(sel, 'tfMPTCanTransfer')
    expect(result).not.toBe(sel)
    expect(sel.tfMPTCanEscrow).toBe(true) // original unchanged
  })
})
