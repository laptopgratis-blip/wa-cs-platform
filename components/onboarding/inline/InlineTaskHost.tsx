'use client'

// InlineTaskHost — dispatcher untuk inline mini-form di /onboarding/guide.
// Pilih sub-component sesuai `kind`. Setiap inline task memanggil
// `onCompleted()` saat sukses; parent (OnboardingGuide) akan mark step
// completed + advance ke step berikut.

import type { InlineTaskKind } from '@/lib/onboarding/checklists'

import { InlineBankAdd } from './InlineBankAdd'
import { InlineKnowledgeAdd } from './InlineKnowledgeAdd'
import { InlineSoulSetup } from './InlineSoulSetup'
import { InlineWaConnect } from './InlineWaConnect'

export interface InlineTaskCommonProps {
  /** Dipanggil saat user sukses menyelesaikan task — parent advance step. */
  onCompleted: () => void
  /** Link ke halaman lengkap, untuk escape-hatch "buka halaman penuh". */
  fallbackHref: string
}

interface Props extends InlineTaskCommonProps {
  kind: InlineTaskKind
}

export function InlineTaskHost({ kind, onCompleted, fallbackHref }: Props) {
  switch (kind) {
    case 'wa_connect':
      return (
        <InlineWaConnect onCompleted={onCompleted} fallbackHref={fallbackHref} />
      )
    case 'bank_add':
      return (
        <InlineBankAdd onCompleted={onCompleted} fallbackHref={fallbackHref} />
      )
    case 'soul_setup':
      return (
        <InlineSoulSetup onCompleted={onCompleted} fallbackHref={fallbackHref} />
      )
    case 'knowledge_add':
      return (
        <InlineKnowledgeAdd
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
  }
}
