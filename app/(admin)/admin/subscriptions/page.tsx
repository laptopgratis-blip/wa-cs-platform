// /admin/subscriptions — admin manage all subscriptions.
import { AdminSubscriptionsView } from '@/components/admin/AdminSubscriptionsView'

export const dynamic = 'force-dynamic'

export default function AdminSubscriptionsPage() {
  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kelola subscription user — approve manual transfer, extend, cancel.
        </p>
      </div>
      <AdminSubscriptionsView />
    </div>
  )
}
