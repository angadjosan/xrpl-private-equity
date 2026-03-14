'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useXRPL } from '@/hooks/useXRPL'

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/create', label: 'Create Token' },
  { href: '/mint', label: 'Mint Shares' },
  { href: '/trade', label: 'Trade' },
  { href: '/distribute', label: 'Distribute' },
]

export default function Navigation() {
  const pathname = usePathname()
  const { status } = useXRPL()

  const statusColor = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
  }[status]

  return (
    <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-1">
            <Link href="/" className="text-lg font-bold text-white mr-8">
              XRPL PE
            </Link>
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className={`w-2 h-2 rounded-full ${statusColor}`} />
            <span>Devnet {status}</span>
          </div>
        </div>
      </div>
    </nav>
  )
}
