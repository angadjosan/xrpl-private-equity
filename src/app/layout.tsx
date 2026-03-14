import type { Metadata } from 'next'
import { AppProviders } from '@/context/AppProviders'
import Navigation from '@/components/Navigation'
import './globals.css'

export const metadata: Metadata = {
  title: 'XRPL Private Equity',
  description: 'Tokenize private company shares as Multi-Purpose Tokens on the XRP Ledger',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppProviders>
          <Navigation />
          <main className="max-w-6xl mx-auto px-4 py-8">
            {children}
          </main>
        </AppProviders>
      </body>
    </html>
  )
}
