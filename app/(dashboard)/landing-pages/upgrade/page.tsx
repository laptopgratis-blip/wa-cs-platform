// /landing-pages/upgrade — DEPRECATED route, redirect ke /pricing.
// Sumber tunggal pricing & checkout sekarang di /pricing → /upgrade?plan=...
// (flow tokenomic, dibayar pakai saldo token). Route ini dipertahankan
// supaya link existing di nav/banner/notif lama tidak 404 sebelum di-update.
import { redirect } from 'next/navigation'

export default function UpgradeLpPage() {
  redirect('/pricing')
}
