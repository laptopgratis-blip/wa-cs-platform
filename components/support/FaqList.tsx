// Daftar FAQ memakai <details>/<summary> native: nol JavaScript, aksesibel,
// dan bisa dirender penuh di server component (komponen accordion shadcn
// belum tersedia di components/ui).
import { ChevronDown } from 'lucide-react'

import { FAQ_GROUPS } from './faq-data'

export function FaqList() {
  return (
    <div className="space-y-6">
      {FAQ_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-500">
            {group.title}
          </h3>
          {group.items.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-warm-200 bg-card p-4 transition-colors hover:border-warm-300 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-warm-900 dark:text-warm-50">
                {item.q}
                <ChevronDown
                  className="size-4 shrink-0 text-warm-400 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-warm-600">{item.a}</p>
            </details>
          ))}
        </div>
      ))}
    </div>
  )
}
