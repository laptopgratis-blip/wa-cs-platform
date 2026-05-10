'use client'

// Client component utama Content Studio dengan 2 tab:
// - Generate Ide: LP picker / brief manual → 15 ide cards → pilih → Generate
// - Library: list ContentPiece dgn filter
import { Loader2, Sparkles, FolderOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IdeaGeneratorTab } from './IdeaGeneratorTab'
import { LibraryTab } from './LibraryTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface LandingPage {
  id: string
  title: string
  slug: string
  isPublished: boolean
}

interface Props {
  initialTab: 'generate' | 'library'
  initialLpId?: string
  landingPages: LandingPage[]
  tokenBalance: number
}

export function ContentStudioClient({
  initialTab,
  initialLpId,
  landingPages,
  tokenBalance,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'generate' | 'library'>(initialTab)

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as 'generate' | 'library')}>
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="generate">
          <Sparkles className="mr-1.5 size-4" />
          Generate Ide
        </TabsTrigger>
        <TabsTrigger value="library">
          <FolderOpen className="mr-1.5 size-4" />
          Library Konten
        </TabsTrigger>
      </TabsList>

      <TabsContent value="generate" className="mt-6">
        <IdeaGeneratorTab
          initialLpId={initialLpId}
          landingPages={landingPages}
          tokenBalance={tokenBalance}
          onPiecesCreated={() => {
            setTab('library')
            router.refresh()
          }}
        />
      </TabsContent>

      <TabsContent value="library" className="mt-6">
        <LibraryTab />
      </TabsContent>
    </Tabs>
  )
}

export { Loader2 } // re-export for child convenience
