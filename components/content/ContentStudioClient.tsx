'use client'

// Client component utama Content Studio dengan 2 tab:
// - Generate Ide: LP picker / brief manual → 15 ide cards → pilih → Generate
// - Library: list ContentPiece dgn filter
import { CalendarDays, FolderOpen, Loader2, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { CalendarTab } from './CalendarTab'
import { IdeaGeneratorTab } from './IdeaGeneratorTab'
import { LibraryTab } from './LibraryTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface LandingPage {
  id: string
  title: string
  slug: string
  isPublished: boolean
}

interface InitialIdea {
  id: string
  method: 'HOOK' | 'PAIN' | 'PERSONA' | 'TRENDS'
  hook: string
  angle: string
  channelFit: string[]
  format: string
  whyItWorks: string
  predictedVirality: number
  funnelStage: 'TOFU' | 'MOFU' | 'BOFU'
  estimatedTokens: number
  isFreePreview: boolean
}

type TabKey = 'generate' | 'library' | 'calendar'

interface Props {
  initialTab: TabKey
  initialLpId?: string
  landingPages: LandingPage[]
  tokenBalance: number
  initialIdeas: InitialIdea[]
}

export function ContentStudioClient({
  initialTab,
  initialLpId,
  landingPages,
  tokenBalance,
  initialIdeas,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>(initialTab)

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
      <TabsList className="grid w-full max-w-xl grid-cols-3">
        <TabsTrigger value="generate">
          <Sparkles className="mr-1.5 size-4" />
          Generate Ide
        </TabsTrigger>
        <TabsTrigger value="library">
          <FolderOpen className="mr-1.5 size-4" />
          Library
        </TabsTrigger>
        <TabsTrigger value="calendar">
          <CalendarDays className="mr-1.5 size-4" />
          Kalender
        </TabsTrigger>
      </TabsList>

      <TabsContent value="generate" className="mt-6">
        <IdeaGeneratorTab
          initialLpId={initialLpId}
          landingPages={landingPages}
          tokenBalance={tokenBalance}
          initialIdeas={initialIdeas}
          onPiecesCreated={() => {
            setTab('library')
            router.refresh()
          }}
        />
      </TabsContent>

      <TabsContent value="library" className="mt-6">
        <LibraryTab />
      </TabsContent>

      <TabsContent value="calendar" className="mt-6">
        <CalendarTab />
      </TabsContent>
    </Tabs>
  )
}

export { Loader2 } // re-export for child convenience
