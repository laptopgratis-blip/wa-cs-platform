# PROMPT PERTAMA UNTUK CLAUDE CODE
# Copy-paste ini ke panel Claude Code di VS Code setelah project dibuat

---

Kamu membantu saya membangun platform SaaS bernama "WA CS Platform".
Baca CLAUDE.md dulu untuk memahami seluruh konteks proyek.

Tugas pertama: Bangun fondasi proyek lengkap dengan urutan ini:

## 1. Setup Prisma
- Copy isi schema.prisma ke prisma/schema.prisma
- Tambahkan ke package.json:
  ```json
  "prisma": { "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts" }
  ```
- Install: `npm install -D ts-node`
- Buat file lib/prisma.ts (singleton Prisma client)

## 2. Setup NextAuth
Buat file:
- `lib/auth.ts` — konfigurasi NextAuth dengan PrismaAdapter, credentials provider (email/password dengan bcrypt), dan Google provider
- `app/api/auth/[...nextauth]/route.ts` — handler NextAuth
- Install: `npm install bcryptjs @types/bcryptjs`

## 3. Middleware
Buat `middleware.ts` di root:
- Protect semua route `/dashboard/*` dan `/admin/*`
- Redirect ke `/login` kalau belum login
- Redirect admin ke `/admin` kalau role = ADMIN

## 4. Layout & Halaman Dasar
Buat:
- `app/layout.tsx` — root layout dengan SessionProvider
- `app/(auth)/login/page.tsx` — halaman login
- `app/(auth)/register/page.tsx` — halaman register
- `app/(dashboard)/layout.tsx` — layout dashboard dengan sidebar
- `app/(dashboard)/dashboard/page.tsx` — halaman dashboard utama
- `app/(admin)/layout.tsx` — layout admin

## 5. Komponen Sidebar Dashboard
Buat `components/dashboard/Sidebar.tsx`:
- Logo di atas
- Menu: Dashboard, WhatsApp, Soul, Inbox, Contacts, Broadcast, Analytics, Billing
- Info token balance di bawah
- Tombol logout

## 6. API Dasar
Buat:
- `app/api/user/balance/route.ts` — GET token balance user yang login
- `app/api/user/profile/route.ts` — GET & PATCH profil user

## Panduan style:
- Pakai shadcn/ui untuk semua komponen UI
- Dark mode support via Tailwind
- Warna utama: zinc/slate (sesuai shadcn init)
- Semua teks error dalam Bahasa Indonesia
- Loading state di semua tombol yang submit form

Mulai dari nomor 1, kerjakan satu per satu, tanya kalau ada yang perlu dikonfirmasi.
