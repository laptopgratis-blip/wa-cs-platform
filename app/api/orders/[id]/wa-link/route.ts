// GET /api/orders/[invoiceNumber]/wa-link (PUBLIC, no-auth)
// Generate wa.me URL dengan template pesan yang sudah di-fill variable.
// Variabel: {invoiceNumber}, {totalRp}, {bankName}, {accountName},
//           {customerName}.
import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const DEFAULT_TEMPLATE = `Halo kak, ini bukti transfer untuk pesanan #{invoiceNumber}.

Total: Rp {totalRp}
Bank: {bankName} a.n. {accountName}

Mohon dicek ya, terima kasih 🙏`

function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{(\w+)\}/g,
    (_, key) => vars[key] ?? '',
  )
}

function formatRupiah(n: number): string {
  return n.toLocaleString('id-ID')
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // `id` di URL = invoiceNumber (folder /api/orders/[id]/ shared dengan
  // detail order admin yang juga pakai param `id`).
  const { id: invoiceNumber } = await params

  const order = await prisma.userOrder.findUnique({
    where: { invoiceNumber },
    include: {
      user: {
        select: {
          shippingProfile: {
            select: {
              waConfirmNumber: true,
              waConfirmTemplate: true,
              waConfirmActive: true,
            },
          },
        },
      },
    },
  })
  if (!order) return jsonError('Invoice tidak ditemukan', 404)

  const profile = order.user.shippingProfile
  if (
    !profile?.waConfirmActive ||
    !profile.waConfirmNumber ||
    !/^62\d{8,15}$/.test(profile.waConfirmNumber)
  ) {
    return jsonError(
      'Penjual belum mengaktifkan WA konfirmasi. Pakai upload bukti.',
      400,
    )
  }

  // Ambil bank default dari snapshot supaya pesan match dengan rekening yg
  // ditampilkan di invoice. Fallback bank pertama kalau no default.
  const banks = (order.bankAccountSnapshot as Array<{
    bankName: string
    accountName: string
    isDefault: boolean
  }> | null) ?? []
  const bank = banks.find((b) => b.isDefault) ?? banks[0]

  const template = profile.waConfirmTemplate?.trim() || DEFAULT_TEMPLATE
  const filled = fillTemplate(template, {
    invoiceNumber: order.invoiceNumber ?? '',
    totalRp: formatRupiah(order.totalRp),
    bankName: bank?.bankName ?? '',
    accountName: bank?.accountName ?? '',
    customerName: order.customerName,
  })

  const url = `https://wa.me/${profile.waConfirmNumber}?text=${encodeURIComponent(filled)}`
  return jsonOk({ url })
}
