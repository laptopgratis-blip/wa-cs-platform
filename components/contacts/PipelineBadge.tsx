// Badge label pipeline stage — tone via registry lib/status.ts + StatusBadge.
import type { PipelineStage } from '@prisma/client'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { pipelineStageMeta, statusMeta } from '@/lib/status'

export function PipelineBadge({ stage }: { stage: PipelineStage }) {
  const meta = statusMeta(pipelineStageMeta, stage)
  return <StatusBadge tone={meta.tone} label={meta.label} />
}
