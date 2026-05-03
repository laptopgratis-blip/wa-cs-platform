// Badge label pipeline stage dengan warna berbeda per stage.
import type { PipelineStage } from '@prisma/client'

import { Badge } from '@/components/ui/badge'
import { PIPELINE_LABELS } from '@/lib/validations/contact'
import { cn } from '@/lib/utils'

const colorClass: Record<PipelineStage, string> = {
  NEW: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  PROSPECT: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  INTEREST: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  NEGOTIATION: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  CLOSED_WON: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  CLOSED_LOST: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
}

export function PipelineBadge({ stage }: { stage: PipelineStage }) {
  return (
    <Badge variant="outline" className={cn('font-normal', colorClass[stage])}>
      {PIPELINE_LABELS[stage]}
    </Badge>
  )
}
