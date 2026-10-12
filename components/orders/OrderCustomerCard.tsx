'use client'

// Kartu data pelanggan di OrderDetailDialog: mode baca + mode edit.
// Customer sering salah ketik nomor/alamat — seller bisa membetulkan Nama,
// Nomor HP, Alamat lengkap dan Kode Pos. Area (kota/kecamatan) tetap read-only
// karena terikat ongkir. Komponen ini TIDAK menyimpan sendiri: draft dipegang
// dialog dan ikut terkirim lewat tombol "Simpan Perubahan" (satu PATCH, satu
// tombol filled per dialog).
import { Pencil } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatShippingArea } from '@/lib/format'
import {
  type CustomerEditDraft,
  type CustomerEditExisting,
  orderHasShipping,
} from '@/lib/services/orders/customer-edit'

export interface OrderCustomerInfo extends CustomerEditExisting {
  shippingCityName?: string | null
  shippingDistrictName?: string | null
  shippingSubdistrictName?: string | null
  shippingProvinceName?: string | null
  flowName: string | null
}

interface Props {
  order: OrderCustomerInfo
  /** null = mode baca. */
  draft: CustomerEditDraft | null
  onDraftChange: (draft: CustomerEditDraft) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  /** Ada follow-up PENDING → beri tahu seller antrean ikut data baru. */
  hasPendingFollowUp: boolean
  disabled?: boolean
}

const FIELD_LABEL = 'text-sm font-medium text-warm-700'

// Gabungan area + provinsi + kode pos untuk satu baris read-only.
function areaLine(order: OrderCustomerInfo, withPostalCode: boolean) {
  const area = formatShippingArea(order)
  if (!area) return null
  return (
    <>
      <span className="font-medium">{area}</span>
      {order.shippingProvinceName && (
        <span>, {order.shippingProvinceName}</span>
      )}
      {withPostalCode && order.shippingPostalCode && (
        <span> {order.shippingPostalCode}</span>
      )}
    </>
  )
}

export function OrderCustomerCard({
  order,
  draft,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  hasPendingFollowUp,
  disabled = false,
}: Props) {
  const fieldId = useId()
  const hasShipping = orderHasShipping(order)
  const hasArea = formatShippingArea(order) !== null

  return (
    <section className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Data pelanggan</p>
        {draft ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancelEdit}
            disabled={disabled}
          >
            Batal
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onStartEdit}
            disabled={disabled}
          >
            <Pencil />
            Edit
          </Button>
        )}
      </div>

      {draft ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-name`} className={FIELD_LABEL}>
                Nama
              </Label>
              <Input
                id={`${fieldId}-name`}
                value={draft.name}
                onChange={(e) =>
                  onDraftChange({ ...draft, name: e.target.value })
                }
                maxLength={120}
                autoComplete="off"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-phone`} className={FIELD_LABEL}>
                Nomor HP
              </Label>
              <Input
                id={`${fieldId}-phone`}
                type="tel"
                inputMode="tel"
                value={draft.phone}
                onChange={(e) =>
                  onDraftChange({ ...draft, phone: e.target.value })
                }
                maxLength={20}
                placeholder="081234567890"
                autoComplete="off"
                disabled={disabled}
              />
              <p className="text-muted-foreground text-xs">
                Format 08xx atau 628xx. Nomor luar negeri diawali tanda +.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-address`} className={FIELD_LABEL}>
              {hasShipping ? 'Alamat lengkap' : 'Alamat (opsional)'}
            </Label>
            <Textarea
              id={`${fieldId}-address`}
              rows={3}
              value={draft.address}
              onChange={(e) =>
                onDraftChange({ ...draft, address: e.target.value })
              }
              maxLength={1000}
              placeholder="Nama jalan, nomor rumah, RT/RW, patokan"
              disabled={disabled}
            />
          </div>

          {hasShipping && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${fieldId}-postal`} className={FIELD_LABEL}>
                  Kode pos
                </Label>
                <Input
                  id={`${fieldId}-postal`}
                  inputMode="numeric"
                  value={draft.postalCode}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      // Hanya digit, maksimal 5 — kode pos Indonesia.
                      postalCode: e.target.value.replace(/\D/g, '').slice(0, 5),
                    })
                  }
                  maxLength={5}
                  placeholder="40123"
                  autoComplete="off"
                  disabled={disabled}
                />
              </div>
              {hasArea && (
                <div className="space-y-2">
                  <p className={FIELD_LABEL}>Area</p>
                  <p className="text-warm-700">{areaLine(order, false)}</p>
                </div>
              )}
            </div>
          )}

          <div className="text-muted-foreground space-y-1 text-xs">
            {hasShipping && (
              <p>
                Area (kota/kecamatan) tidak bisa diubah karena terikat ongkir.
              </p>
            )}
            {hasPendingFollowUp && (
              <p>Follow-up yang masih terjadwal ikut memakai data baru.</p>
            )}
            <p>Tekan Simpan Perubahan di bawah untuk menyimpan.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p>
            <span className="text-muted-foreground">Nama:</span>{' '}
            <span className="font-medium">{order.customerName}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Nomor HP:</span>{' '}
            {order.customerPhone}
          </p>
          {order.customerAddress && (
            <p>
              <span className="text-muted-foreground">Alamat:</span>{' '}
              <span className="whitespace-pre-line">
                {order.customerAddress}
              </span>
            </p>
          )}
          {hasArea ? (
            <p>
              <span className="text-muted-foreground">Area:</span>{' '}
              {areaLine(order, true)}
            </p>
          ) : (
            order.shippingPostalCode && (
              <p>
                <span className="text-muted-foreground">Kode pos:</span>{' '}
                {order.shippingPostalCode}
              </p>
            )
          )}
        </div>
      )}

      {order.flowName && (
        <p className="text-muted-foreground text-xs">Asal: {order.flowName}</p>
      )}
    </section>
  )
}
