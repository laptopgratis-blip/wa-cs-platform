---
version: 1.0
name: hulao-design-system
description: Design system hulao — bahasa desain terinspirasi Supabase (kanvas putih, ladder abu netral, hairline 1px, radius tajam, tipografi humanist ber-tracking negatif) dengan orange sebagai satu-satunya peristiwa kromatik. Berlaku untuk scope dashboard/admin/auth; halaman publik (landing, /live, /embed, /order, /review, belajar, onboarding, output LP) punya gaya sendiri.

colors:
  primary: "#f97316"          # orange-500 — CTA, aksen brand, SATU-SATUNYA warna kromatik
  primary-deep: "#ea6c0a"     # orange-600 — hover/pressed
  primary-soft: "#fb923c"     # orange-400 — focus ring, chart accent
  primary-tint: "#fff7ed"     # primary-50 — tint dekoratif & badge brand
  on-primary: "#171717"       # ink di atas orange ("lit surface") — BUKAN putih
  ink: "#171717"              # warm-900 — teks utama, near-black
  ink-secondary: "#212121"    # warm-800
  ink-mute: "#707070"         # warm-500 — teks sekunder (4.9:1 di putih)
  ink-mute-2: "#a3a3a3"       # warm-400 — teks tersier/placeholder
  canvas: "#ffffff"           # latar halaman — komitmen kanvas putih
  canvas-soft: "#fafafa"      # warm-50 — band section selang-seling
  canvas-night: "#1c1c1c"     # blok kode / mockup gelap (dark mode nonaktif)
  hairline: "#e5e5e5"         # warm-200 — border 1px default
  hairline-strong: "#d4d4d4"  # warm-300 — border penekanan
  status-success: "emerald"   # HANYA via lib/ui-tones.ts
  status-warning: "amber"
  status-danger: "red"
  status-info: "sky"
  status-neutral: "warm"
  channel-whatsapp: "emerald" # aksen kanal WA, bukan status

typography:
  display:
    fontFamily: "Plus Jakarta Sans (var --font-display)"
    weights: "500 / 600 — mid-weight; JANGAN melebihi 600"
    letterSpacing: "-0.02em (global untuk h1–h6 di globals.css)"
  body:
    fontFamily: "Inter (var --font-body)"
    weights: "400 / 500"
  mono:
    fontFamily: "JetBrains Mono (var --font-mono)"
    use: "kode, ID teknis, nomor tabular"

rounded:
  sm: 4px    # tag hairline
  md: 6px    # tombol, input, select, textarea, chip — radius signature
  lg: 8px    # menu dropdown, alert, panel kompak
  xl: 12px   # card, dialog, mockup produk
  2xl: 16px  # chrome container besar
  full: 9999px # pill status, avatar — JANGAN untuk tombol

spacing:
  antar-section: gap-6
  dalam-card: space-y-4
  label-ke-input: space-y-2
  toolbar: gap-2
  padding-card: "px-4 (primitive Card)"
---

# Hulao Design System

## Ringkasan

Bahasa desain hulao mengejar kejernihan di atas segalanya — diadaptasi dari
sistem Supabase, dengan **orange** menggantikan emerald sebagai satu-satunya
peristiwa kromatik.

Permukaan dashboard duduk di **kanvas putih** (`bg-background` = `#ffffff`),
teks dirender **ink** (`#171717` — near-black, tidak pernah pure black).
Seluruh hierarki visual dikerjakan oleh **ladder abu netral** dari `#fafafa`
sampai `#171717` — di codebase ladder ini memakai nama kelas `warm-*`
(dipertahankan demi kompatibilitas; nilainya kini abu NETRAL, bukan stone).
Satu-satunya warna adalah **orange primary** (`#f97316`): tombol CTA terisi,
aksen ikon, titik indikator, active state navigasi (sebagai tint lembut).

### Karakteristik Kunci

- **Orange langka.** Maksimal SATU tombol filled orange per halaman/dialog.
  Selebihnya outline/ghost. Aksen dekoratif memakai tint `primary-50`.
- **Ink di atas orange.** Teks/ikon di atas fill orange = `text-warm-900`
  (`#171717`), BUKAN putih. Tombol terbaca sebagai permukaan "menyala" dengan
  tipe gelap — sekaligus lolos WCAG AA (6.4:1; putih hanya 2.8:1, gagal).
- **Kanvas putih adalah desainnya.** Tanpa gradient atmosferik, tanpa tint
  latar halaman. Pemisah antar-permukaan = hairline 1px, bukan bayangan.
- **Radius tajam-teknis.** Tombol/input 6px (`rounded-md`), card/dialog 12px
  (`rounded-xl`). Tidak ada tombol pill.
- **Display mid-weight ber-tracking negatif.** Plus Jakarta Sans 500–600,
  `letter-spacing: -0.02em` — padat-editorial, bukan dekoratif.

## Warna

### Brand
- **Orange** (`#f97316` / `bg-primary`, `bg-primary-500`): CTA terisi, aksen
  ikon PageHeader, dot indikator, bar aksen nav.
- **Orange Deep** (`#ea6c0a` / `primary-600`): state hover tombol default.
- **Orange Soft** (`#fb923c` / `primary-400`): focus ring (`--ring`), chart.
- **Tint** (`primary-50`–`primary-200`): latar badge brand, tint dekoratif,
  active state sidebar (`bg-primary-50 text-primary-700`).
- **On-Primary** (`#171717`): teks di atas fill orange. Token
  `--primary-foreground` sudah menunjuk ke sini — `text-primary-foreground`
  otomatis benar. Jangan pernah menulis `text-white` di atas `bg-primary-*`.

### Permukaan & Ladder Netral (`warm-*`)
| Kelas | Hex | Peran |
|---|---|---|
| `warm-50` | `#fafafa` | canvas-soft — band selang-seling |
| `warm-100` | `#f5f5f5` | hover netral, secondary/muted |
| `warm-200` | `#e5e5e5` | **hairline** — border 1px default |
| `warm-300` | `#d4d4d4` | hairline strong, scrollbar |
| `warm-400` | `#a3a3a3` | teks tersier, placeholder |
| `warm-500` | `#707070` | ink-mute — teks sekunder |
| `warm-600` | `#525252` | teks sekunder tegas |
| `warm-700` | `#404040` | teks sidebar/label kuat |
| `warm-800` | `#212121` | ink-secondary |
| `warm-900` | `#171717` | **ink** — teks utama & on-primary |

DILARANG memakai `zinc|neutral|gray|slate|stone-*` — selalu `warm-*`.
Hover menu/dropdown = netral (`--accent` = `#f5f5f5`), bukan tint orange.

### Status
HANYA via `lib/ui-tones.ts` (`TONES`) + `<StatusBadge>` + registry
`lib/status.ts`. success=emerald · warning=amber · danger=red · info=sky ·
neutral=warm · brand=primary · whatsapp=emerald (aksen kanal, bukan status —
jangan sandingkan dengan badge success). Warna status TIDAK ikut aturan
"orange langka" — mereka informasi, bukan dekorasi.

### Chart
`var(--chart-1)`..`var(--chart-5)` — ladder orange monokrom. Jangan hex
literal di komponen recharts.

## Tipografi

- **Display**: Plus Jakarta Sans — analog open-source terdekat dari humanist
  geometrik ala Circular. Weight **500–600 saja** (h1 `font-semibold`;
  `font-bold` hanya untuk angka stat besar). Tracking `-0.02em` sudah global.
- **Body**: Inter 400; label/penekanan 500 (`font-medium`).
- **Mono**: JetBrains Mono untuk kode, kunci API, ID teknis, angka tabular.

| Tingkat | Kelas | Catatan |
|---|---|---|
| h1 halaman | milik `<PageHeader>`: `font-display text-2xl md:text-3xl font-semibold tracking-tight text-warm-900` | satu per halaman |
| h2 section | `font-display text-xl font-semibold text-warm-900` | |
| h3 | `text-lg font-semibold` | |
| Body | `text-sm` | default UI |
| Label field | `text-sm font-medium text-warm-700` | |
| Meta/caption/badge | `text-xs` | **FLOOR 12px** — dilarang `text-[8..11px]` dan `text-[13px]` |

## Elevasi & Kedalaman

| Level | Perlakuan | Pakai untuk |
|---|---|---|
| 0 | Flat + hairline (`Card` bawaan: `ring-1 ring-foreground/10`) | Card default |
| 1 | `shadow-md` (bawaan primitive) | Popover, dropdown, select content |
| 2 | `shadow-orange` (token `--shadow-orange`) | HANYA penanda paket unggulan di halaman uang |

Dilarang menambah `shadow-sm/md/lg/xl` generik ke Card/panel. Kedalaman
dibangun dari hairline dan susunan permukaan, bukan bayangan. Card butuh
garis lebih tegas → `ring-*`, BUKAN `border-*` (no-op senyap — Card memakai
ring tanpa border-width).

## Bentuk (Radius)

Ikuti primitive — jangan override:
- `rounded-md` **6px** — tombol, input, select, textarea, chip. Radius
  signature: kotak-teknis, bukan pill.
- `rounded-lg` **8px** — menu dropdown, alert, panel kompak.
- `rounded-xl` **12px** — card, panel, dialog, mockup.
- `rounded-full` — pill status, avatar, dot. JANGAN untuk tombol.
- Maksimal 2–3 radius berbeda per file.

## Komponen

### Tombol (`ui/button.tsx`)
- **default** — fill orange + teks ink (token). Maks SATU per halaman/dialog.
  TANPA override `bg-primary-500...` / `text-white` (hover `primary-600`
  sudah bawaan varian).
- **outline** — aksi toolbar/sekunder. **ghost** — tersier.
  **destructive** — merah lembut untuk aksi merusak.
- Icon size diatur primitive — jangan `h-4 w-4` manual.

### Card (`ui/card.tsx`)
Polos: `rounded-xl` + `ring-1` + `px-4`. Dilarang menambah `border-warm-200`
(no-op), `rounded-xl` (redundan), `shadow-*` generik, `bg-white` (redundan).
Panel hand-rolled → migrasi ke `<Card>`. Tint dekoratif hanya
`bg-primary-50`; panel status → `TONES[tone].bg/border`.

### Form
Input/select/textarea dari primitive (radius 6px, focus ring orange).
Label `text-sm font-medium text-warm-700`, jarak `space-y-2` ke input.

### Tabel
`space-y-4` → toolbar → wrapper `rounded-md border` → shadcn `<Table>` →
`<Pagination>`. Di dalam `<Card>`: `<Table>` langsung TANPA wrapper border
(garis dobel; primitive sudah punya `overflow-x-auto` sendiri).

### Navigasi
Aksen tunggal `NAV_ACCENT` (`lib/navigation.ts`): active =
`bg-primary-50 text-primary-700` + bar `bg-primary-500`. Grup dibedakan
spacing, bukan warna. Modal via `ui/dialog.tsx`/`ui/sheet.tsx`.

### Lain-lain
- Badge status → `<StatusBadge>`; label non-status → `ui/Badge` tanpa warna raw.
- Empty state → `<EmptyState bordered>`. Loading → skeleton shared /
  `<Loader2 className="size-4 animate-spin" />` + `"Memuat…"`.
- Container → `<PageContainer width>`: narrow `max-w-3xl` · default
  `max-w-6xl` · wide `max-w-7xl`.
- Ikon: HANYA lucide-react. **Emoji dilarang di seluruh copy UI** (chrome,
  heading, toast, notif in-app, empty state, badge — termasuk halaman publik/
  landing): emoji-sebagai-ikon → ganti lucide; emoji dekoratif di kalimat →
  hapus. PENGECUALIAN: konten pesan WhatsApp keluar (template, follow-up,
  notif WA) dan instruksi/prompt AI — emoji idiomatik di chat WA, itu konten,
  bukan tampilan aplikasi.

## Do & Don't

### Do
- Sediakan orange secukupnya — satu CTA filled per viewport; sisanya abu.
- Pakai ink `text-warm-900` di atas fill orange (juga via
  `text-primary-foreground`).
- Bangun pemisah dengan hairline `warm-200`, bukan bayangan.
- Display mid-weight (500–600) dengan tracking negatif.
- Mono untuk semua kode/ID/angka teknis.

### Don't
- Jangan tambah warna aksen sistem baru — palet non-status
  (`blue|purple|violet|indigo|fuchsia|pink|rose|teal|cyan|lime|orange-*`)
  dilarang di scope; status hanya via `TONES`.
- Jangan pakai emoji di copy/chrome UI mana pun — ikon = lucide-react
  (kecuali konten pesan WA keluar & prompt AI).
- Jangan `text-white` di atas `bg-primary-*`.
- Jangan tombol pill; radius tombol 6px.
- Jangan gradient atmosferik / tint latar halaman — kanvas putih adalah
  desainnya.
- Jangan display weight > 600 (`font-bold` heading, `font-extrabold`).
- Jangan tulis class `dark:` baru (forcedTheme light).

## Responsif

| Breakpoint | Perubahan kunci |
|---|---|
| ≥1440 | Container penuh sesuai `PageContainer` |
| 1024–1440 | Default; grid kartu 3–4 kolom |
| 768–1023 | Grid 2 kolom; sidebar tetap |
| <768 | 1 kolom; BottomNav mobile (`pb-mobile-nav` untuk clearance) |

Touch target ≥44px di mobile; tabel selalu scroll di containernya sendiri
(primitive `<Table>` sudah membungkus `overflow-x-auto`) — body halaman tidak
pernah scroll horizontal.

## Panduan Iterasi

1. Sumber token: `app/globals.css` (`@theme` + `:root`). Ubah nilai di sana,
   bukan di komponen.
2. Registry status: `lib/ui-tones.ts` — satu-satunya file yang boleh memakai
   palet Tailwind mentah untuk status.
3. Aturan operasional ringkas + scope enforcement: `CLAUDE.md § Design System
   UI`. Dokumen ini (DESIGN.md) adalah sumber kebenaran arah visual.
4. Halaman publik (landing, /live, /embed, /order, /review, belajar,
   onboarding, output LP `app/p/[slug]`, template OG/canvas) TIDAK disapu
   aturan ini.
