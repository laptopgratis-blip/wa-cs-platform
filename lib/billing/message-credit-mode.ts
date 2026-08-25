// Mode penagihan Kredit Pesan WA (Trek 2B) — SATU saklar untuk seluruh alur.
//
// KEPUTUSAN OWNER 2026-08-25: model markup biaya pesan Meta DILEWATI.
// Riset (memo "Siapa yang Membayar Meta?") menyimpulkan Tech Provider tidak
// bisa credit line sharing — seller yang onboard nomor resmi memasang kartu
// sendiri dan DITAGIH META LANGSUNG. Menagih Kredit Pesan di atasnya berarti
// menagih dua kali untuk biaya yang sama.
//
// Efek flag = false:
// - assertCanSendCloud tidak pernah menetapkan creditUserId → tidak ada
//   potongan saldo, tidak ada INSUFFICIENT_CREDIT, rekonsiliasi webhook
//   pricing jadi no-op (jalur kirim template tetap jalan penuh).
// - Section Kredit Pesan di /billing, kartu saldo di sidebar/drawer, dan
//   estimasi kredit di form broadcast disembunyikan.
// - Pembelian paket kind MESSAGE_CREDIT ditolak (checkout & kedua route
//   payment create) — melindungi dari tautan langsung.
//
// Infrastruktur (tabel, ledger, rate admin, apply-payment-credit) SENGAJA
// dibiarkan utuh: kalau nanti hulao masuk Multi-Partner Solutions dengan
// Solution Partner (jalur markup yang sah), cukup balikkan flag ini dan
// tinjau ulang teks UI yang kini menyebut "ditagih Meta langsung".
export const MESSAGE_CREDIT_BILLING_ENABLED = false
