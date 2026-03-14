'use client'

import { useXRPL } from '@/hooks/useXRPL'
import { useToken } from '@/hooks/useToken'
import TopBar from '@/components/TopBar'
import CreateForm from '@/components/CreateForm'
import ShareManager from '@/components/ShareManager'

export default function Home() {
  const { status } = useXRPL()
  const { token } = useToken()

  const isDeployed = !!token.mptIssuanceId

  return (
    <div className="min-h-screen">
      <TopBar status={status} />

      <div className="max-w-2xl mx-auto px-6 py-12">
        {!isDeployed ? <CreateForm /> : <ShareManager />}
      </div>
    </div>
  )
}
