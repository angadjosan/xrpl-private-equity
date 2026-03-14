'use client'

import { useWallet } from '@/hooks/useWallet'
import { useXRPL } from '@/hooks/useXRPL'
import { truncateAddress } from '@/utils/format'

export default function WalletConnect() {
  const { client, status } = useXRPL()
  const { wallets, generateIssuer, generateProtocol, addShareholder, removeShareholder, loading } = useWallet()
  const isConnected = status === 'connected'

  return (
    <div className="card space-y-4">
      <h3 className="text-lg font-semibold text-white">Wallet Management</h3>
      <p className="text-sm text-gray-400">Generate devnet wallets for each role. All wallets are funded from the XRPL devnet faucet.</p>

      <div className="grid gap-3">
        {/* Issuer */}
        <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
          <div>
            <span className="text-sm font-medium text-gray-300">Issuer</span>
            {wallets.issuer ? (
              <p className="text-xs font-mono text-green-400">{truncateAddress(wallets.issuer.address)}</p>
            ) : (
              <p className="text-xs text-gray-500">Not generated</p>
            )}
          </div>
          {!wallets.issuer && (
            <button onClick={generateIssuer} disabled={!isConnected || loading} className="btn-primary text-sm">
              {loading ? 'Funding...' : 'Generate'}
            </button>
          )}
        </div>

        {/* Protocol */}
        <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
          <div>
            <span className="text-sm font-medium text-gray-300">Protocol</span>
            {wallets.protocol ? (
              <p className="text-xs font-mono text-green-400">{truncateAddress(wallets.protocol.address)}</p>
            ) : (
              <p className="text-xs text-gray-500">Not generated</p>
            )}
          </div>
          {!wallets.protocol && (
            <button onClick={generateProtocol} disabled={!isConnected || loading} className="btn-primary text-sm">
              {loading ? 'Funding...' : 'Generate'}
            </button>
          )}
        </div>

        {/* Shareholders */}
        <div className="bg-gray-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Shareholders ({wallets.shareholders.length})</span>
            <button onClick={addShareholder} disabled={!isConnected || loading} className="btn-secondary text-sm">
              {loading ? 'Funding...' : '+ Add'}
            </button>
          </div>
          {wallets.shareholders.map((w, i) => (
            <div key={w.address} className="flex items-center justify-between text-xs">
              <span className="font-mono text-green-400">{truncateAddress(w.address)}</span>
              <button onClick={() => removeShareholder(i)} className="text-red-400 hover:text-red-300">Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
