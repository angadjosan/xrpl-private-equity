'use client'

import { MPT_FLAGS, applyFlagDependencies } from '@/lib/flags'
import type { FlagSelections } from '@/types'

interface FlagSelectorProps {
  selections: FlagSelections
  onChange: (selections: FlagSelections) => void
  disabled?: boolean
}

export default function FlagSelector({ selections, onChange, disabled }: FlagSelectorProps) {
  const handleToggle = (key: string) => {
    const updated = { ...selections, [key]: !selections[key] }
    // Auto-apply dependency logic
    const resolved = applyFlagDependencies(updated, key)
    onChange(resolved)
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-white">MPT Flags</h3>
      <p className="text-sm text-gray-400">Configure token capabilities. All flags are immutable after creation.</p>

      <div className="grid gap-2">
        {MPT_FLAGS.map(flag => {
          const isOn = selections[flag.key] ?? flag.default
          const isDependencyMissing = flag.dependencies?.some(dep => !selections[dep])

          return (
            <div
              key={flag.key}
              className={`flex items-start gap-3 bg-gray-800 rounded-lg p-3 ${
                isDependencyMissing && isOn ? 'border border-yellow-600' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => handleToggle(flag.key)}
                disabled={disabled}
                className={`mt-0.5 w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${
                  isOn ? 'bg-blue-600' : 'bg-gray-600'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    isOn ? 'left-5' : 'left-1'
                  }`}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{flag.label}</span>
                  <span className="text-xs font-mono text-gray-500">{flag.key}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{flag.description}</p>
                {!isOn && flag.warningIfOff && (
                  <p className="text-xs text-yellow-400 mt-1">{flag.warningIfOff}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-xs text-gray-500 bg-gray-800/50 rounded p-2">
        Combined flags value: <span className="font-mono text-white">0x{Object.entries(selections).reduce((acc, [key, val]) => {
          if (!val) return acc
          const flag = MPT_FLAGS.find(f => f.key === key)
          return acc | (flag?.hex ?? 0)
        }, 0).toString(16).padStart(2, '0').toUpperCase()}</span>
      </div>
    </div>
  )
}
