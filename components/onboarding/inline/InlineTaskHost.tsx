'use client'

// InlineTaskHost — dispatcher untuk inline mini-form di /onboarding/guide.
// Pilih sub-component sesuai `kind`. Setiap inline task memanggil
// `onCompleted()` saat sukses; parent (OnboardingGuide) akan mark step
// completed + advance ke step berikut.

import type { InlineTaskKind } from '@/lib/onboarding/checklists'

import { InlineBankAdd } from './InlineBankAdd'
import { InlineCourseAdd } from './InlineCourseAdd'
import { InlineFollowupOn } from './InlineFollowupOn'
import { InlineKnowledgeAdd } from './InlineKnowledgeAdd'
import { InlineLessonAdd } from './InlineLessonAdd'
import { InlineLmsSubscribe } from './InlineLmsSubscribe'
import { InlineLpPublish } from './InlineLpPublish'
import { InlineOrderForm } from './InlineOrderForm'
import { InlineProductAdd } from './InlineProductAdd'
import { InlineSalesFlow } from './InlineSalesFlow'
import { InlineShippingZone } from './InlineShippingZone'
import { InlineSoulSetup } from './InlineSoulSetup'
import { InlineTestChat } from './InlineTestChat'
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
    case 'product_add':
      return (
        <InlineProductAdd
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'order_form':
      return (
        <InlineOrderForm
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'test_chat':
      return (
        <InlineTestChat
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'followup_on':
      return (
        <InlineFollowupOn
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'sales_flow':
      return (
        <InlineSalesFlow
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'course_add':
      return (
        <InlineCourseAdd
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'lesson_add':
      return (
        <InlineLessonAdd
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'shipping_zone':
      return (
        <InlineShippingZone
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'lp_publish':
      return (
        <InlineLpPublish
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
    case 'lms_subscribe':
      return (
        <InlineLmsSubscribe
          onCompleted={onCompleted}
          fallbackHref={fallbackHref}
        />
      )
  }
}
