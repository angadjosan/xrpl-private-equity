'use client'

import type { MPTHolder } from '@/types'
import { truncateAddress } from '@/utils/format'

interface HolderTableProps {
  holders: MPTHolder[]
  totalShares: number
  onLock?: (account: string) => void
  onUnlock?: (account: string) => void
  onClawback?: (account: string) => void
}

export default function HolderTable({ holders, totalShares, onLock, onUnlock, onClawback }: HolderTableProps) {
  if (holders.length === 0) {
    return (
      <div className="card text-center text-gray-500 py-8">
        No token holders found.
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <h3 className="text-lg font-semibold text-white mb-4">Token Holders</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="text-left py-2 pr-4">Account</th>
            <th className="text-right py-2 pr-4">Balance</th>
            <th className="text-right py-2 pr-4">% Ownership</th>
            <th className="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {holders.map(holder => {
            const balance = parseFloat(holder.balance)
            const pct = totalShares > 0 ? ((balance / totalShares) * 100).toFixed(2) : '0.00'

            return (
              <tr key={holder.account} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="py-2 pr-4 font-mono text-xs">{truncateAddress(holder.account)}</td>
                <td className="py-2 pr-4 text-right text-white">{balance.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right">{pct}%</td>
                <td className="py-2 text-right space-x-2">
                  {onLock && (
                    <button onClick={() => onLock(holder.account)} className="text-xs text-yellow-400 hover:text-yellow-300">
                      Lock
                    </button>
                  )}
                  {onUnlock && (
                    <button onClick={() => onUnlock(holder.account)} className="text-xs text-green-400 hover:text-green-300">
                      Unlock
                    </button>
                  )}
                  {onClawback && (
                    <button onClick={() => onClawback(holder.account)} className="text-xs text-red-400 hover:text-red-300">
                      Clawback
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
