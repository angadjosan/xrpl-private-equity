'use client'

import { useXRPL } from '@/hooks/useXRPL'
import { useWallet } from '@/hooks/useWallet'
import { useToken } from '@/hooks/useToken'
import WalletConnect from '@/components/WalletConnect'
import { truncateAddress } from '@/utils/format'
import Link from 'next/link'

export default function Dashboard() {
  const { status } = useXRPL()
  const { wallets } = useWallet()
  const { token } = useToken()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">XRPL Private Equity Protocol</h1>
        <p className="text-gray-400 mt-2">
          Tokenize private company shares as Multi-Purpose Tokens on the XRP Ledger.
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="text-sm text-gray-400">Network</h3>
          <p className="text-xl font-semibold text-white mt-1">Devnet</p>
          <p className={`text-sm mt-1 ${status === 'connected' ? 'text-green-400' : 'text-yellow-400'}`}>
            {status}
          </p>
        </div>
        <div className="card">
          <h3 className="text-sm text-gray-400">Token</h3>
          {token.mptIssuanceId ? (
            <>
              <p className="text-xl font-semibold text-white mt-1">{token.metadata?.t ?? 'Active'}</p>
              <p className="text-xs font-mono text-gray-500 mt-1">{truncateAddress(token.mptIssuanceId, 8, 6)}</p>
            </>
          ) : (
            <p className="text-xl font-semibold text-gray-600 mt-1">Not created</p>
          )}
        </div>
        <div className="card">
          <h3 className="text-sm text-gray-400">Holders</h3>
          <p className="text-xl font-semibold text-white mt-1">{token.holders.length}</p>
          <p className="text-sm text-gray-500 mt-1">
            {token.totalShares > 0 ? `${token.totalShares.toLocaleString()} total shares` : 'No shares issued'}
          </p>
        </div>
      </div>

      {/* Wallet Management */}
      <WalletConnect />

      {/* Flow Navigation */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Protocol Flows</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/create" className="card hover:border-blue-600 transition-colors group">
            <h3 className="text-lg font-semibold text-white group-hover:text-blue-400">1. Create Token</h3>
            <p className="text-sm text-gray-400 mt-1">
              Issue an MPT with equity metadata, compliance flags, and transfer settings.
            </p>
            <div className="mt-3 text-xs text-gray-500">
              {wallets.issuer && wallets.protocol ? 'Ready' : 'Generate Issuer + Protocol wallets first'}
            </div>
          </Link>

          <Link href="/mint" className="card hover:border-blue-600 transition-colors group">
            <h3 className="text-lg font-semibold text-white group-hover:text-blue-400">2. Mint Shares</h3>
            <p className="text-sm text-gray-400 mt-1">
              Register shareholders, create escrows, and release tokens.
            </p>
            <div className="mt-3 text-xs text-gray-500">
              {token.mptIssuanceId ? 'Token created' : 'Create token first'}
            </div>
          </Link>

          <Link href="/trade" className="card hover:border-blue-600 transition-colors group">
            <h3 className="text-lg font-semibold text-white group-hover:text-blue-400">3. Trade</h3>
            <p className="text-sm text-gray-400 mt-1">
              P2P transfers, DEX trading, lock/freeze, and clawback.
            </p>
            <div className="mt-3 text-xs text-gray-500">
              {token.holders.length > 0 ? `${token.holders.length} holders` : 'Mint shares first'}
            </div>
          </Link>

          <Link href="/distribute" className="card hover:border-blue-600 transition-colors group">
            <h3 className="text-lg font-semibold text-white group-hover:text-blue-400">4. Distribute Cashflow</h3>
            <p className="text-sm text-gray-400 mt-1">
              Proportional dividend/distribution payments to all holders.
            </p>
            <div className="mt-3 text-xs text-gray-500">
              {token.holders.length > 0 ? 'Ready to distribute' : 'Need holders first'}
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
