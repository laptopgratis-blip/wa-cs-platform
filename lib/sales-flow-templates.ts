// Template pre-built untuk Sales Flow. Saat user pilih template, kita copy
// `steps` + `finalAction` + `triggerKeywords` ke row UserSalesFlow baru.
// Setelah dibuat, user bisa edit isinya bebas — template ini hanya seeding.
//
// Field di tiap step:
//   - fieldName: kunci untuk menyimpan jawaban di OrderSession.collectedData
//                (camelCase). Dipakai juga sebagai placeholder {fieldName}
//                di replyMessage.
//   - question:  pertanyaan yang dikirim ke customer.
//   - validation: rule sederhana yang dicek flow-engine. null = anything goes.
//                 'min_words:N' | 'phone' | 'address' | 'yes_no'

export type SalesFlowValidation =
  | 'min_words:2'
  | 'min_words:3'
  | 'phone'
  | 'address'
  | 'yes_no'
  | null

export interface SalesFlowStep {
  fieldName: string
  question: string
  validation: SalesFlowValidation
}

export interface SalesFlowFinalAction {
  notifyAdmin: boolean
  adminPhone: string
  replyMessage: string
  // Hanya untuk template TRANSFER. Kalau ada, AI akan kirim info ini saat
  // tahap pengumpulan bukti transfer.
  bankInfo?: {
    bankName: string
    accountNumber: string
    accountName: string
  }
}

export interface SalesFlowTemplate {
  template: 'COD' | 'TRANSFER' | 'BOOKING' | 'CONSULTATION' | 'CUSTOM'
  name: string
  emoji: string
  description: string
  triggerKeywords: string[]
  steps: SalesFlowStep[]
  finalAction: SalesFlowFinalAction
}

const NAME_STEP: SalesFlowStep = {
  fieldName: 'customerName',
  question: 'Boleh tahu nama lengkapnya kak?',
  validation: 'min_words:2',
}

const PHONE_STEP: SalesFlowStep = {
  fieldName: 'customerPhone',
  question: 'Nomor HP yang aktif untuk dihubungi kurir?',
  validation: 'phone',
}

const ADDRESS_STEP: SalesFlowStep = {
  fieldName: 'customerAddress',
  question:
    'Alamat lengkap untuk pengiriman ya kak — sertakan kelurahan, kecamatan, kota, dan kode pos.',
  validation: 'address',
}

const CONFIRM_STEP: SalesFlowStep = {
  fieldName: 'orderConfirmation',
  question:
    'Saya konfirmasi pesanannya:\n- Nama: {customerName}\n- HP: {customerPhone}\n- Alamat: {customerAddress}\n\nLanjut order ya kak? (ketik "ya" untuk konfirmasi)',
  validation: 'yes_no',
}

export const SALES_FLOW_TEMPLATES: SalesFlowTemplate[] = [
  {
    template: 'COD',
    name: 'Pengiriman COD',
    emoji: '🚚',
    description: 'AI akan tanya: nama, nomor HP, alamat, lalu konfirmasi.',
    triggerKeywords: ['cod', 'bayar di tempat', 'bayar ditempat'],
    steps: [NAME_STEP, PHONE_STEP, ADDRESS_STEP, CONFIRM_STEP],
    finalAction: {
      notifyAdmin: true,
      adminPhone: '',
      replyMessage:
        'Pesanan dicatat ya kak {customerName}, kurir akan kontak ke {customerPhone}. Terima kasih! 🙏',
    },
  },
  {
    template: 'TRANSFER',
    name: 'Bayar Transfer',
    emoji: '💳',
    description:
      'AI akan tanya: nama, alamat, kirim info rekening, tunggu bukti transfer.',
    triggerKeywords: ['transfer', 'tf', 'rekening', 'bayar transfer'],
    steps: [
      NAME_STEP,
      ADDRESS_STEP,
      {
        fieldName: 'bankPaymentNotice',
        question:
          'Silakan transfer ke rekening berikut:\n{bankInfo}\n\nSetelah transfer, kirim foto bukti transfer ya kak. Ketik "sudah" kalau sudah dikirim.',
        validation: 'yes_no',
      },
    ],
    finalAction: {
      notifyAdmin: true,
      adminPhone: '',
      replyMessage:
        'Terima kasih kak {customerName}! Bukti transfer akan kami cek dan barang dikirim ke {customerAddress} setelah verifikasi. 🙏',
      bankInfo: {
        bankName: '',
        accountNumber: '',
        accountName: '',
      },
    },
  },
  {
    template: 'BOOKING',
    name: 'Booking / Reservasi',
    emoji: '📅',
    description:
      'AI akan tanya: nama, tanggal & jam, jumlah orang, lalu konfirmasi.',
    triggerKeywords: ['booking', 'reservasi', 'pesan tempat', 'booking jadwal'],
    steps: [
      NAME_STEP,
      PHONE_STEP,
      {
        fieldName: 'bookingDateTime',
        question: 'Mau booking untuk tanggal & jam berapa?',
        validation: 'min_words:2',
      },
      {
        fieldName: 'bookingPartySize',
        question: 'Untuk berapa orang ya kak?',
        validation: null,
      },
      {
        fieldName: 'orderConfirmation',
        question:
          'Saya konfirmasi reservasinya:\n- Nama: {customerName}\n- HP: {customerPhone}\n- Waktu: {bookingDateTime}\n- Jumlah orang: {bookingPartySize}\n\nLanjut booking ya kak? (ketik "ya")',
        validation: 'yes_no',
      },
    ],
    finalAction: {
      notifyAdmin: true,
      adminPhone: '',
      replyMessage:
        'Reservasi dicatat ya kak {customerName} untuk {bookingDateTime}. Sampai jumpa! 🙏',
    },
  },
  {
    template: 'CONSULTATION',
    name: 'Konsultasi',
    emoji: '💼',
    description:
      'AI akan tanya: nama, topik konsultasi, lalu jadwalkan dengan tim.',
    triggerKeywords: ['konsultasi', 'tanya', 'mau konsul'],
    steps: [
      NAME_STEP,
      PHONE_STEP,
      {
        fieldName: 'consultationTopic',
        question: 'Boleh tahu topik / pertanyaan yang mau dikonsultasikan?',
        validation: 'min_words:3',
      },
    ],
    finalAction: {
      notifyAdmin: true,
      adminPhone: '',
      replyMessage:
        'Terima kasih kak {customerName}! Tim kami akan kontak ke {customerPhone} untuk lanjut konsultasi mengenai "{consultationTopic}". 🙏',
    },
  },
  {
    template: 'CUSTOM',
    name: 'Custom',
    emoji: '✏️',
    description: 'Buat alur sendiri dari nol — tentukan pertanyaannya sendiri.',
    triggerKeywords: [],
    steps: [],
    finalAction: {
      notifyAdmin: false,
      adminPhone: '',
      replyMessage: 'Terima kasih ya kak! Tim kami akan follow-up segera.',
    },
  },
]

export function getTemplateByKey(
  key: string,
): SalesFlowTemplate | undefined {
  return SALES_FLOW_TEMPLATES.find((t) => t.template === key)
}
