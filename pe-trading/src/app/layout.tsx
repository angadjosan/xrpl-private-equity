import type { Metadata } from 'next'
import './globals.css'
import { WalletProvider } from '@/context/WalletContext'

export const metadata: Metadata = {
  title: 'PE Terminal — XRPL Private Equity',
  description: 'Private equity trading terminal with XRPL Vault-backed leverage',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  )
}
