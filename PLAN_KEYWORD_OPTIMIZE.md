# Plan: Perluas Keyword Trigger Knowledge dengan AI

Dibuat 2026-05-11 di sesi yang sebelumnya sempat terputus. Catatan ini supaya kalau terputus lagi bisa lanjut dari sini.

## Masalah
User punya knowledge `testimoni` dengan trigger keyword terbatas (mis. cuma "testimoni"). Saat customer bilang "ada bukti?" / "hasil pemakaian dong" / "review nya gimana" — AI tidak trigger karena keyword tidak match. User mau ada bantuan AI untuk perluas keyword (sinonim, slang, typo) supaya trigger meluas.

## Yang SUDAH ADA (sudah dibangun sebelumnya)
- `components/knowledge/KnowledgeForm.tsx` baris 456-469: tombol "Optimasi AI / Perluas dengan AI" ✅
- `app/api/knowledge/suggest-keywords/route.ts`: endpoint AI yang generate 10-15 variasi (sinonim, slang WA, typo, pertanyaan natural) ✅
- `lib/services/knowledge-retriever.ts`: relaxed token match (kata distinctive >=5 char, bukan stopword) ✅

## Gap & Yang Perlu Ditambah
1. **Knowledge LAMA tidak ter-optimize**: entry yang dibuat sebelum tombol Optimasi ada cuma punya 1-2 keyword manual user. User harus buka satu-satu klik Optimasi AI → manual & melelahkan.
2. **Saat create baru, user bisa lupa klik**: kalau keyword cuma 1-2 lalu Simpan, knowledge baru juga punya keyword minim.

## Plan Eksekusi (Step-by-step)

### Step 1 — Bulk Optimasi di `/knowledge` (HIGH IMPACT)
Tombol "Optimasi Semua Keyword (AI)" di KnowledgeList header. Klik → loop semua entry yang `triggerKeywords.length < 5`, panggil suggest-keywords per entry, append hasilnya, PATCH ke DB. Progress UI (X dari N selesai).

- Endpoint baru: `POST /api/knowledge/bulk-suggest-keywords` — terima array `{id}[]` atau filter all-active-with-few-keywords, return per-id `{id, keywords[]}` tanpa langsung save (biar user bisa preview).
- Atau lebih simple: loop client-side panggil suggest-keywords yang existing + PATCH per entry. Pro: reuse endpoint, tidak buat duplicate. Con: N round-trip. Pilih simple dulu.

**Pilihan implementasi**: client-side loop. Pakai endpoint existing `/api/knowledge/suggest-keywords` + PATCH `/api/knowledge/[id]`. Throttle 1 request/detik supaya tidak hit rate-limit Anthropic.

### Step 2 — Auto-suggest saat Submit Knowledge Baru (MEDIUM IMPACT)
Di `KnowledgeForm.handleSubmit`, kalau `keywords.length < 3`, tampilkan dialog confirm: "Kata kunci masih sedikit. AI bisa tambah variasi (bukti, review, dll) supaya trigger lebih luas. Tambah sekarang?" — kalau Ya, panggil suggest-keywords lalu append, baru save.

Lebih halus daripada auto-trigger tanpa konfirmasi.

### Step 3 — UI Hint Lebih Jelas (LOW IMPACT)
Tombol "Optimasi AI" sudah ada tapi mungkin user tidak notice. Tambah banner kecil di atas keyword section: "💡 Tip: klik Optimasi AI untuk dapat 10-15 variasi keyword otomatis (sinonim, slang, typo)."

## Catatan Pas Eksekusi
- Pakai komponen UI yang sudah ada: `Button`, `Dialog`, `Progress` dari `components/ui`.
- `requireSession()` di endpoint, jangan lupa.
- Limit bulk: max 50 entry per klik supaya tidak biaya AI bengkak.
- Throttle 800ms antar request ke Anthropic.
- Setelah bulk selesai, `router.refresh()` supaya list update.
