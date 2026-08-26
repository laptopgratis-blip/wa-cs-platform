// Single source of truth menu navigasi.
// Dipakai oleh: Sidebar (desktop), AdminSidebar (desktop), MobileDrawer
// (mobile slide-out), BottomNav (mobile bottom).
//
// Menu dipisah jadi grup ber-kategori supaya gampang dibaca user awam:
// PRODUKTIVITAS, LAPORAN, AKUN untuk user; MANAJEMEN, AI & SOUL, ANALISIS
// untuk admin.
import {
  Activity,
  Banknote,
  Webhook,
  BarChart3,
  BellRing,
  BookMarked,
  BookOpen,
  Bot,
  Box,
  Building2,
  Calculator,
  Code2,
  Compass,
  Cpu,
  CreditCard,
  DollarSign,
  FileText,
  FlaskConical,
  Globe,
  GraduationCap,
  Home,
  Inbox,
  Key,
  LayoutTemplate,
  LifeBuoy,
  LineChart,
  MapPin,
  MessageCircle,
  Package,
  Palette,
  Plug,
  Receipt,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sliders,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Video,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

export type Role = 'USER' | 'ADMIN' | 'FINANCE'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  // Role yang boleh lihat — kosong = semua role yang punya akses ke parent.
  roles?: Role[]
  // Item hanya untuk paket POWER (Order System). Gating per-ITEM: dipakai saat
  // integrasi POWER (Pixel, Auto Confirm) berada di grup yang tampil untuk
  // semua user — hanya item-nya yang disembunyikan bila user tak punya akses.
  requiresOrderSystem?: boolean
}

// Aksen nav TUNGGAL — brand orange untuk state aktif, netral untuk sisanya.
// Grup dibedakan lewat spacing + header uppercase, bukan warna-warni
// (pelangi 9-hue sebelumnya = sumber utama kesan UI berantakan).
export interface NavAccent {
  /** Warna teks header grup (uppercase kecil). */
  header: string
  /** Warna ikon item non-aktif. */
  icon: string
  /** bg + teks item aktif. */
  active: string
  /** Warna ikon item aktif. */
  activeIcon: string
  /** Warna bar indikator kiri item aktif. */
  bar: string
}

export const NAV_ACCENT: NavAccent = {
  header: 'text-warm-400',
  icon: 'text-warm-500',
  active: 'bg-primary-50 text-primary-700',
  activeIcon: 'text-primary-600',
  bar: 'bg-primary-500',
}

export interface NavGroup {
  label: string
  items: NavItem[]
  // Group hanya tampil kalau user punya akses Order System (paket POWER).
  // Filter dilakukan di komponen yang konsumsi (Sidebar, MobileDrawer).
  requiresOrderSystem?: boolean
}

// ─── USER (dashboard) ─────────────────────────────────────────────────
// Reorganisasi 2026-05-09:
// - Group "PRODUKTIVITAS" lama dipecah → "CHAT & CS" + "LANDING PAGE"
// - "Pesanan" pindah dari Produktivitas ke ORDER SYSTEM (kontekstual cocok)
// - "Rekening" → "Pengaturan" (label, route tetap /bank-accounts) karena
//   page itu juga berisi pengaturan pengiriman (origin city, kurir aktif)
// - Pixel Tracking + Auto Confirm Bank pindah dari ORDER SYSTEM ke grup
//   integrasi (2026-08-26: kini item POWER-gated di grup "INTEGRASI")
export const USER_NAV_GROUPS: NavGroup[] = [
  {
    label: 'CHAT & CS',
    items: [
      { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
      { label: 'Inbox', href: '/inbox', icon: Inbox },
      { label: 'Soul', href: '/soul', icon: Sparkles },
      { label: 'Pengetahuan', href: '/knowledge', icon: BookOpen },
      { label: 'Cara Jualan', href: '/cara-jualan', icon: ShoppingBag },
      { label: 'Kontak', href: '/contacts', icon: Users },
      { label: 'Broadcast', href: '/broadcast', icon: Send },
      // Template Meta (Trek 2B, 2026-08-20) — template pesan WhatsApp Cloud
      // API (wajib untuk pesan di luar window 24 jam pada nomor resmi Meta).
      {
        label: 'Template Meta',
        href: '/whatsapp/templates',
        icon: LayoutTemplate,
      },
      // CS Live AI rooms (PR-0b, 2026-06-01). Avatar live shopping dengan
      // chat AI + TTS. Customer akses URL publik /live/<slug>.
      { label: 'Live Rooms', href: '/live-rooms', icon: Video },
      // Phase 2 brief — user bikin host AI sendiri (Gemini+Kling). Token
      // dipotong dari saldo user.
      { label: 'Host AI', href: '/host-templates', icon: Bot },
    ],
  },
  // Order System — hanya tampil untuk user paket POWER. Filter di komponen
  // konsumer berdasarkan flag hasOrderSystemAccess (lib/order-system-gate).
  // Pesanan & Pengaturan(rekening+shipping) masuk di sini supaya satu konteks.
  {
    label: 'ORDER SYSTEM',
    requiresOrderSystem: true,
    items: [
      { label: 'Pesanan', href: '/pesanan', icon: Package },
      { label: 'Produk', href: '/products', icon: ShoppingCart },
      // E-Book (2026-08-06) — aset digital PDF/EPUB yang dijual via produk.
      { label: 'E-Book', href: '/ebooks', icon: BookOpen },
      { label: 'Form Order', href: '/order-forms', icon: FileText },
      { label: 'Zona Ongkir', href: '/shipping-zones', icon: MapPin },
      // Multi-gudang (2026-07-13) — setup >1 gudang; sistem auto pilih gudang
      // termurah saat customer isi alamat.
      { label: 'Gudang', href: '/warehouses', icon: Warehouse },
      // Follow-Up Order System (2026-05-08) — pesan otomatis ke customer
      // berdasarkan event order + delay hari.
      { label: 'Follow-Up', href: '/pesanan/follow-up', icon: BellRing },
      {
        label: 'Template Follow-Up',
        href: '/pesanan/templates',
        icon: LayoutTemplate,
      },
      // Testimoni (Fase 3, 2026-06-08) — panen via link follow-up setelah
      // order diterima.
      { label: 'Testimoni', href: '/pesanan/testimoni', icon: Star },
      // Page /bank-accounts berisi rekening transfer + shipping profile.
      // Label eksplisit supaya tidak bentrok mental dgn "pengaturan akun".
      // Route tetap supaya tidak breaking existing bookmark.
      { label: 'Rekening & Ongkir', href: '/bank-accounts', icon: Settings },
    ],
  },
  {
    label: 'LANDING PAGE',
    items: [
      { label: 'Landing Page', href: '/landing-pages', icon: Globe },
      { label: 'Content Studio', href: '/content', icon: Palette },
    ],
  },
  // LMS — Phase 1-3, 2026-05-09. Course saya = builder produk digital + e-course.
  // Customer beli produk linked → otomatis enroll.
  {
    label: 'LMS',
    items: [
      { label: 'Course Saya', href: '/lms/courses', icon: GraduationCap },
    ],
  },
  // Integrasi — POWER only. Pixel & auto-confirm di-pisah dari Order System
  // supaya scope grup itu fokus ke operasional jualan harian.
  {
    label: 'LAPORAN',
    items: [{ label: 'Analytics', href: '/analytics', icon: BarChart3 }],
  },
  // Upgrade LP/LMS dipindah ke sini (2026-07-10) — upsell dipisah dari grup
  // fitur supaya grup fitur murni navigasi operasional.
  {
    label: 'AKUN',
    items: [
      { label: 'Billing', href: '/billing', icon: CreditCard },
      { label: 'Riwayat Pembelian', href: '/purchases', icon: Receipt },
      { label: 'Upgrade LP', href: '/pricing', icon: TrendingUp },
      { label: 'Upgrade LMS', href: '/pricing-lms', icon: Rocket },
    ],
  },
  // INTEGRASI (2026-08-26; dulu "PENGEMBANG") — satu grup berisi TIAP integrasi
  // sebagai item terpisah. API/Webhook/Script&Embed tampil untuk SEMUA user
  // (kunci API tetap dibuat sendiri). Pixel & Auto Confirm khusus POWER via
  // requiresOrderSystem per-item (grup ini sendiri tidak POWER-gated).
  {
    label: 'INTEGRASI',
    items: [
      { label: 'API', href: '/pengembang/api', icon: Code2 },
      { label: 'Webhook', href: '/pengembang/webhook', icon: Webhook },
      { label: 'Script & Embed', href: '/pengembang/integrasi', icon: Plug },
      {
        label: 'Pixel Tracking',
        href: '/integrations/pixels',
        icon: Activity,
        requiresOrderSystem: true,
      },
      // Phase 1 BETA, 2026-05-08 — auto-confirm transfer via scraping mutasi
      // BCA. Disclaimer & risk handling di halaman tujuan.
      {
        label: 'Auto Confirm (BETA)',
        href: '/integrations/bank-mutation',
        icon: Banknote,
        requiresOrderSystem: true,
      },
    ],
  },
  // DUKUNGAN — sengaja TIDAK pernah disembunyikan oleh HIDDEN_GROUPS_BY_GOAL:
  // user yang paling butuh bantuan justru yang menyederhanakan menunya.
  {
    label: 'DUKUNGAN',
    items: [
      { label: 'Dokumentasi', href: '/dokumentasi', icon: BookMarked },
      { label: 'Bantuan & Dukungan', href: '/bantuan', icon: LifeBuoy },
    ],
  },
]

// Item paling utama di sidebar (di atas grup) — Dashboard tidak masuk grup
// supaya jadi "home" yang menonjol.
export const USER_NAV_HOME: NavItem = {
  label: 'Dashboard',
  href: '/dashboard',
  icon: Home,
}

// ─── ADMIN ────────────────────────────────────────────────────────────
export const ADMIN_NAV_HOME: NavItem = {
  label: 'Dashboard',
  href: '/admin/dashboard',
  icon: BarChart3,
}

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: 'MANAJEMEN',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users, roles: ['ADMIN'] },
      {
        label: 'WhatsApp Sessions',
        href: '/admin/whatsapp-sessions',
        icon: Smartphone,
        roles: ['ADMIN'],
      },
      {
        label: 'Finance',
        href: '/admin/finance',
        icon: Wallet,
        roles: ['ADMIN', 'FINANCE'],
      },
      {
        label: 'Token Packages',
        href: '/admin/packages',
        icon: Box,
        roles: ['ADMIN'],
      },
      // Trek 2B — harga Kredit Pesan WA per kategori template Meta.
      {
        label: 'Kredit Pesan WA',
        href: '/admin/message-credits',
        icon: MessageCircle,
        roles: ['ADMIN'],
      },
      {
        label: 'Paket LP',
        href: '/admin/lp-packages',
        icon: Globe,
        roles: ['ADMIN'],
      },
      {
        label: 'Upgrade LP',
        href: '/admin/lp-upgrades',
        icon: TrendingUp,
        roles: ['ADMIN', 'FINANCE'],
      },
      // Approve/extend/cancel subscription + verifikasi transfer manual.
      // Sebelumnya halaman ini hanya bisa dicapai lewat deep-link notifikasi
      // upload bukti transfer — admin yang melewatkan notif kehilangan akses.
      // ADMIN saja: middleware membatasi FINANCE ke /admin/finance/*.
      {
        label: 'Subscriptions',
        href: '/admin/subscriptions',
        icon: RefreshCw,
        roles: ['ADMIN'],
      },
      // LMS Phase 1 — admin manual add/revoke enrollment student per course.
      {
        label: 'Enrollment LMS',
        href: '/admin/lms-enrollments',
        icon: GraduationCap,
        roles: ['ADMIN'],
      },
      // LMS Phase 3 — CRUD plan upgrade LMS (mirror /admin/lp-packages).
      {
        label: 'Paket LMS',
        href: '/admin/lms-packages',
        icon: GraduationCap,
        roles: ['ADMIN'],
      },
      {
        label: 'Rekening Bank',
        href: '/admin/bank-accounts',
        icon: Building2,
        roles: ['ADMIN'],
      },
      // Phase 1 BETA, 2026-05-08 — kill switch + monitor scraper BCA per user.
      {
        label: 'Bank Integrations (BETA)',
        href: '/admin/bank-integrations',
        icon: Banknote,
        roles: ['ADMIN'],
      },
    ],
  },
  {
    label: 'AI & SOUL',
    items: [
      {
        label: 'AI Models',
        href: '/admin/models',
        icon: Cpu,
        roles: ['ADMIN'],
      },
      {
        label: 'Pricing Database',
        href: '/admin/ai-pricing',
        icon: DollarSign,
        roles: ['ADMIN'],
      },
      {
        label: 'AI Features Pricing',
        href: '/admin/ai-features',
        icon: Sparkles,
        roles: ['ADMIN'],
      },
      {
        label: 'API Keys',
        href: '/admin/api-keys',
        icon: Key,
        roles: ['ADMIN'],
      },
      {
        label: 'Soul Settings',
        href: '/admin/soul-settings',
        icon: Sparkles,
        roles: ['ADMIN'],
      },
      {
        label: 'Soul Lab',
        href: '/admin/soul-lab',
        icon: FlaskConical,
        roles: ['ADMIN'],
      },
      // CS Live AI host library (PR-0a, 2026-06-01). Pipeline Gemini → Kling
      // untuk avatar live shopping. Live room ada di PR-0b.
      {
        label: 'CS Live Host',
        href: '/admin/host-templates',
        icon: Video,
        roles: ['ADMIN'],
      },
    ],
  },
  {
    label: 'ANALISIS',
    items: [
      // Pemantauan biaya AI per provider + log penggunaan per user (2026-06-08).
      {
        label: 'Token & Biaya AI',
        href: '/admin/token-cost',
        icon: DollarSign,
        roles: ['ADMIN'],
      },
      {
        label: 'Profitability',
        href: '/admin/profitability',
        icon: LineChart,
        roles: ['ADMIN'],
      },
      {
        label: 'Pricing Calculator',
        href: '/admin/pricing-calculator',
        icon: Calculator,
        roles: ['ADMIN'],
      },
      {
        label: 'Pricing Settings',
        href: '/admin/pricing-settings',
        icon: Sliders,
        roles: ['ADMIN'],
      },
      {
        label: 'Onboarding Funnel',
        href: '/admin/onboarding-funnel',
        icon: Compass,
        roles: ['ADMIN'],
      },
    ],
  },
  {
    label: 'SISTEM',
    items: [
      {
        label: 'Pengaturan',
        href: '/admin/settings',
        icon: Settings,
        roles: ['ADMIN'],
      },
    ],
  },
]

// ─── BOTTOM NAV (mobile) ──────────────────────────────────────────────
// 5 menu paling sering dipakai user awam. Item terakhir bukan link tapi
// trigger drawer — di-handle khusus di komponen.
export const BOTTOM_NAV_ITEMS: Array<{
  label: string
  icon: LucideIcon
  href?: string // undefined → drawer trigger
}> = [
  { label: 'Home', href: '/dashboard', icon: Home },
  { label: 'Inbox', href: '/inbox', icon: Inbox },
  { label: 'Soul', href: '/soul', icon: Sparkles },
  { label: 'Kontak', href: '/contacts', icon: Users },
  // Drawer trigger — Menu icon ditambahkan di komponen.
]

// Helper: filter NavGroup by role.

// ─── Judul halaman dari nav (dipakai Topbar) ─────────────────────────
// Satu sumber kebenaran: cari item nav dengan href terpanjang yang
// prefix-match pathname. Fallback: kapitalisasi segmen terakhir.
//
// Halaman yang SENGAJA di luar menu (dicapai lewat menu avatar / CTA /
// deep-link) tidak punya item nav, jadi fallback-nya menghasilkan judul
// Inggris atau ber-tanda-hubung ("Profile", "Upgrade-lms"). Untuk itu saja
// ada override di bawah — bukan pengganti PAGE_TITLES lama yang meng-hardcode
// SEMUA rute. Jangan tambah entri di sini untuk halaman yang seharusnya
// memang muncul di sidebar; daftarkan di NAV_GROUPS.
const NAV_TITLE_OVERRIDES: Record<string, string> = {
  '/profile': 'Profil Saya',
  '/upgrade': 'Upgrade Paket',
  '/upgrade-lms': 'Upgrade LMS',
}

export function getNavTitle(pathname: string | null): string {
  if (!pathname) return 'Dashboard'
  const allItems: NavItem[] = [
    USER_NAV_HOME,
    ADMIN_NAV_HOME,
    ...USER_NAV_GROUPS.flatMap((g) => g.items),
    ...ADMIN_NAV_GROUPS.flatMap((g) => g.items),
  ]
  let best: NavItem | null = null
  for (const item of allItems) {
    const match = pathname === item.href || pathname.startsWith(item.href + '/')
    if (match && (!best || item.href.length > best.href.length)) {
      best = item
    }
  }
  if (best) return best.label
  const override = NAV_TITLE_OVERRIDES[pathname]
  if (override) return override
  const seg = pathname.split('/').filter(Boolean).pop() ?? 'Dashboard'
  return seg.charAt(0).toUpperCase() + seg.slice(1)
}

export function filterGroupsByRole(groups: NavGroup[], role: Role): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
    }))
    .filter((g) => g.items.length > 0)
}

// Filter group berdasarkan akses Order System. Group dengan requiresOrderSystem
// di-skip kalau hasAccess=false. Dipakai di Sidebar (desktop) + MobileDrawer.
export function filterGroupsByOrderSystem(
  groups: NavGroup[],
  hasOrderSystemAccess: boolean,
): NavGroup[] {
  return groups
    .filter((g) => !g.requiresOrderSystem || hasOrderSystemAccess)
    .map((g) => {
      // Gating per-ITEM: buang item POWER dari grup non-POWER (mis. Pixel &
      // Auto Confirm di grup INTEGRASI). Grup yang seluruhnya POWER sudah
      // lolos filter di atas, jadi item-nya dibiarkan.
      if (hasOrderSystemAccess || !g.items.some((i) => i.requiresOrderSystem)) return g
      return { ...g, items: g.items.filter((i) => !i.requiresOrderSystem) }
    })
    .filter((g) => g.items.length > 0)
}

// ─── ONBOARDING GOAL FILTER ───────────────────────────────────────────
// Sembunyikan group yang tidak relevan untuk goal user. Tujuan: user awam
// yg goal-nya cuma "CS AI" tidak overwhelmed lihat sidebar 20+ menu.
// User tetap bisa override via tombol "Tampilkan semua menu" di Sidebar.

export type OnboardingGoal = 'CS_AI' | 'SELL_LP' | 'SELL_WA' | 'LMS'

// Map goal → list group label yang di-hide. Match by label (case-sensitive)
// supaya consistent dgn definisi group di atas. Group label baru harus
// di-update di mapping ini juga.
const HIDDEN_GROUPS_BY_GOAL: Record<OnboardingGoal, string[]> = {
  // CS AI saja → tidak butuh jualan / course / integrasi pixel.
  CS_AI: ['ORDER SYSTEM', 'LANDING PAGE', 'LMS'],
  // Jualan + LP → tidak butuh LMS.
  SELL_LP: ['LMS'],
  // Jualan WA only → tidak butuh LP & LMS. Content Studio (di group LP)
  // juga ke-hide; user bisa unhide via "Tampilkan semua menu".
  SELL_WA: ['LANDING PAGE', 'LMS'],
  // Course/digital → semua relevan, tidak ada hide.
  LMS: [],
}

export function filterGroupsByGoal(
  groups: NavGroup[],
  goal: OnboardingGoal | null | undefined,
  showAll: boolean,
): NavGroup[] {
  if (!goal || showAll) return groups
  const hide = HIDDEN_GROUPS_BY_GOAL[goal]
  if (!hide || hide.length === 0) return groups
  return groups.filter((g) => !hide.includes(g.label))
}

// Helper: cek apakah filter byGoal menyembunyikan group apa pun. Dipakai
// untuk decide apakah render tombol "Tampilkan semua menu" di Sidebar.
export function hasHiddenGroupsForGoal(
  groups: NavGroup[],
  goal: OnboardingGoal | null | undefined,
): boolean {
  if (!goal) return false
  const hide = HIDDEN_GROUPS_BY_GOAL[goal] ?? []
  return hide.some((label) => groups.some((g) => g.label === label))
}
