// Single source of truth menu navigasi.
// Dipakai oleh: Sidebar (desktop), AdminSidebar (desktop), MobileDrawer
// (mobile slide-out), BottomNav (mobile bottom).
//
// Menu dipisah jadi grup ber-kategori supaya gampang dibaca user awam:
// PRODUKTIVITAS, LAPORAN, AKUN untuk user; MANAJEMEN, AI & SOUL, ANALISIS
// untuk admin.
import {
  BarChart3,
  BookOpen,
  Box,
  Building2,
  Calculator,
  Cpu,
  CreditCard,
  DollarSign,
  FlaskConical,
  Globe,
  Home,
  Inbox,
  Key,
  LineChart,
  MessageCircle,
  Package,
  Receipt,
  Send,
  Settings,
  ShoppingBag,
  Sliders,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type Role = 'USER' | 'ADMIN' | 'FINANCE'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  // Role yang boleh lihat — kosong = semua role yang punya akses ke parent.
  roles?: Role[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// ─── USER (dashboard) ─────────────────────────────────────────────────
export const USER_NAV_GROUPS: NavGroup[] = [
  {
    label: 'PRODUKTIVITAS',
    items: [
      { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
      { label: 'Inbox', href: '/inbox', icon: Inbox },
      { label: 'Soul', href: '/soul', icon: Sparkles },
      { label: 'Pengetahuan', href: '/knowledge', icon: BookOpen },
      { label: 'Cara Jualan', href: '/cara-jualan', icon: ShoppingBag },
      { label: 'Pesanan', href: '/pesanan', icon: Package },
      { label: 'Kontak', href: '/contacts', icon: Users },
      { label: 'Broadcast', href: '/broadcast', icon: Send },
      { label: 'Landing Page', href: '/landing-pages', icon: Globe },
      { label: 'Upgrade LP', href: '/landing-pages/upgrade', icon: TrendingUp },
    ],
  },
  {
    label: 'LAPORAN',
    items: [{ label: 'Analytics', href: '/analytics', icon: BarChart3 }],
  },
  {
    label: 'AKUN',
    items: [
      { label: 'Billing', href: '/billing', icon: CreditCard },
      { label: 'Riwayat Pembelian', href: '/purchases', icon: Receipt },
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
      {
        label: 'Rekening Bank',
        href: '/admin/bank-accounts',
        icon: Building2,
        roles: ['ADMIN'],
      },
    ],
  },
  {
    label: 'AI & SOUL',
    items: [
      { label: 'AI Models', href: '/admin/models', icon: Cpu, roles: ['ADMIN'] },
      {
        label: 'Pricing Database',
        href: '/admin/ai-pricing',
        icon: DollarSign,
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
    ],
  },
  {
    label: 'ANALISIS',
    items: [
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
export function filterGroupsByRole(
  groups: NavGroup[],
  role: Role,
): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
    }))
    .filter((g) => g.items.length > 0)
}
