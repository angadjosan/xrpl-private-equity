'use client'

import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Client } from 'xrpl'
import { XRPL_DEVNET_WSS } from '@/lib/constants'
import type { ConnectionStatus } from '@/types'

interface XRPLContextValue {
  client: Client | null
  status: ConnectionStatus
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

export const XRPLContext = createContext<XRPLContextValue>({
  client: null,
  status: 'disconnected',
  connect: async () => {},
  disconnect: async () => {},
})

export function XRPLProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<Client | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')

  const connect = useCallback(async () => {
    if (clientRef.current?.isConnected()) return

    setStatus('connecting')
    try {
      const client = new Client(XRPL_DEVNET_WSS)
      await client.connect()
      clientRef.current = client
      setStatus('connected')
    } catch (err) {
      console.error('XRPL connection failed:', err)
      setStatus('error')
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (clientRef.current?.isConnected()) {
      await clientRef.current.disconnect()
    }
    clientRef.current = null
    setStatus('disconnected')
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return (
    <XRPLContext.Provider
      value={{
        client: clientRef.current,
        status,
        connect,
        disconnect,
      }}
    >
      {children}
    </XRPLContext.Provider>
  )
}
