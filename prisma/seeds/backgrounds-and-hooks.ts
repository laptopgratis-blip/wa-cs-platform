// Seed: 25 BackgroundPreset + 50 VisualHookPreset.
//
// Jalankan: npx tsx prisma/seeds/backgrounds-and-hooks.ts
//
// Idempotent — pakai upsert by slug. Aman dijalankan berkali-kali.
// Thumbnail di-set placeholder dulu (/uploads/presets/<slug>.png).
// Asset gambar nanti diisi admin via /admin/host-presets (Phase 2).

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─────────────────────────────────────────
// 25 BACKGROUND PRESETS (riset TikTok ID live shopping)
// ─────────────────────────────────────────

interface BackgroundSeed {
  slug: string
  category: 'trust-scale' | 'production' | 'premium' | 'lifestyle' | 'specialty'
  nameId: string
  nameEn: string
  description: string
  promptFragment: string
  motionHint: string
  vibeTags: string[]
  sortOrder: number
}

const BACKGROUNDS: BackgroundSeed[] = [
  // A. Trust/Scale (1-5)
  {
    slug: 'gudang-tumpuk-tinggi',
    category: 'trust-scale',
    nameId: 'Gudang Tumpuk Tinggi',
    nameEn: 'Tall Warehouse Shelves',
    description: 'Rak gudang putih tinggi 4m, kotak produk tertumpuk rapi sampai langit-langit, lighting industrial. Memberi kesan "stock ready, real seller, bisa dipercaya".',
    promptFragment: 'Industrial warehouse background with tall white shelving units (4m height) packed with cardboard product boxes stacked neatly all the way up to the ceiling. Bright fluorescent industrial overhead lighting. Concrete polished floor visible at the bottom. Slight depth of field on the back rows. Atmosphere: organized, professional, well-stocked, trustworthy seller scale.',
    motionHint: 'Background stays static — shelves and boxes do not move. Only ambient particles of dust visible in light beams may drift very slightly. Lighting consistent throughout, no flicker.',
    vibeTags: ['industrial', 'trust', 'scale', 'stock-proof'],
    sortOrder: 1,
  },
  {
    slug: 'konveyor-packing-loop',
    category: 'trust-scale',
    nameId: 'Konveyor Packing Loop',
    nameEn: 'Conveyor Belt Packing',
    description: 'Sabuk konveyor berjalan dengan paket coklat lewat di belakang host, gerakan continuous (loop seamless). Visual urgency "lagi dipacking masal sekarang".',
    promptFragment: 'Behind the host: a brown conveyor belt running across the frame at chest level carrying small to medium brown cardboard packages with shipping labels. Belt moves left to right at moderate steady speed. Industrial setting with stainless steel rollers, packing tables on the side. Workers (out of focus) visible at packing stations.',
    motionHint: 'Conveyor belt moves continuously left-to-right at moderate speed (~0.3 m/s). Packages spaced evenly. Movement is constant, smooth, never pausing. Loop endpoint matches startpoint so seamless loop — conveyor speed identical at frame 1 and final frame.',
    vibeTags: ['scale', 'urgency', 'logistics', 'busy'],
    sortOrder: 2,
  },
  {
    slug: 'tim-packing-asisten',
    category: 'trust-scale',
    nameId: 'Tim Packing Asisten',
    nameEn: 'Assistant Packing Team',
    description: '3-5 asisten samar (motion blur) lagi seal paket di meja panjang belakang host. Trust signal "tim besar, bukan kaleng-kaleng".',
    promptFragment: 'Behind the host: long packing tables with 3-5 background assistants (defocused, motion-blurred) actively sealing brown shipping boxes, taping, folding. Each assistant has their own station with tape dispenser, scissors, shipping labels. Warehouse lighting, organized workflow vibe.',
    motionHint: 'Background assistants move continuously: sealing tape pulling motion, hands going up-down, occasional reach for new box. Motion is fluid but not synchronized (each on own pace). Loop seamless — frame 1 and final frame show assistants in equivalent gesture phase.',
    vibeTags: ['trust', 'scale', 'team', 'busy'],
    sortOrder: 3,
  },
  {
    slug: 'tumpukan-paket-siap-kirim',
    category: 'trust-scale',
    nameId: 'Tumpukan Paket Siap Kirim',
    nameEn: 'Ready-to-Ship Pile',
    description: 'Gunungan kardus shipping di sisi host, label "READY STOCK" terlihat. Anti-scam signal kuat.',
    promptFragment: 'Behind and beside the host: large pile of brown shipping cardboard boxes stacked in irregular but stable mound, ~2m height. Visible shipping labels with addresses, courier stickers (JNT, Sicepat-style, blurred). Sticker "READY STOCK" on a few boxes. Warehouse floor concrete.',
    motionHint: 'Boxes completely static — solid pile, no movement. Only very faint dust in lighting may drift. Loop seamless via complete stillness.',
    vibeTags: ['trust', 'anti-scam', 'ready-stock'],
    sortOrder: 4,
  },
  {
    slug: 'van-delivery-loading',
    category: 'trust-scale',
    nameId: 'Van Delivery Bongkar',
    nameEn: 'Delivery Van Loading',
    description: 'Pintu van terbuka di belakang dengan paket di-load, vibe "barang lagi dikirim".',
    promptFragment: 'Behind the host: a delivery van (white or yellow) with rear doors open showing interior packed with cardboard boxes ready for delivery. A worker (defocused) loading boxes. Concrete loading dock. Daylight outdoor lighting from outside the open door.',
    motionHint: 'Worker continuously loading boxes into van: bend down, pick up, lift, place. Repeating cycle ~3-4sec per box. Van itself static. Loop seamless via worker mid-cycle at frame 1 = same phase at final frame.',
    vibeTags: ['logistics', 'shipping', 'authentic'],
    sortOrder: 5,
  },

  // B. Production Authority (6-10)
  {
    slug: 'pabrik-lini-produksi',
    category: 'production',
    nameId: 'Pabrik Lini Produksi',
    nameEn: 'Factory Production Line',
    description: 'Mesin produksi/filling di belakang, lampu putih tajam. Authority "kita produksi sendiri".',
    promptFragment: 'Behind the host: factory production line with stainless steel filling machines, conveyor with bottles or sachets moving through. Industrial white fluorescent overhead lighting. Clean tile floor. Pipes and machinery in background.',
    motionHint: 'Production machine cycles continuously: filling head moves down-up-down rhythmically (~1.5 sec cycle). Bottles/sachets on conveyor move at steady pace. Loop seamless via cycle phase match.',
    vibeTags: ['authority', 'manufacturing', 'scale'],
    sortOrder: 6,
  },
  {
    slug: 'lab-clean-white',
    category: 'production',
    nameId: 'Lab Clean White',
    nameEn: 'White Clean Lab',
    description: 'Meja lab stainless + glassware, dinding putih clean. Credibility skincare/herbal/farmasi.',
    promptFragment: 'Behind the host: pristine white laboratory setting with stainless steel counter, glassware (flasks, beakers, pipettes) arranged neatly, white tile walls and floor, soft cool-white lighting. Maybe a microscope or scale visible. Atmosphere: clinical, controlled, scientific.',
    motionHint: 'Background completely still. Liquid in beakers may show very subtle reflection shimmer only. Loop via stillness.',
    vibeTags: ['authority', 'clean', 'science', 'credibility'],
    sortOrder: 7,
  },
  {
    slug: 'workshop-handmade',
    category: 'production',
    nameId: 'Workshop Handmade',
    nameEn: 'Handmade Workshop',
    description: 'Bahan baku berserakan natural di belakang, vibe artisan. Cocok produk craft, handmade.',
    promptFragment: 'Behind the host: artisan workshop atmosphere with raw materials (fabric rolls, leather strips, wood pieces, or whatever fits the product) arranged on wooden shelves and workbench. Warm tungsten lighting. Tools (scissors, brushes) hanging on pegboard. Lived-in, creative vibe.',
    motionHint: 'Background static. Very subtle shadow shifts from warm lighting OK. Loop via stillness.',
    vibeTags: ['artisan', 'authentic', 'craft', 'warm'],
    sortOrder: 8,
  },
  {
    slug: 'qc-inspection-table',
    category: 'production',
    nameId: 'Meja QC Inspeksi',
    nameEn: 'QC Inspection Table',
    description: 'Meja inspeksi dengan checklist + sample produk. Quality assurance vibe.',
    promptFragment: 'Behind the host: quality control inspection table with stacks of clipboards holding checklists, sample products being inspected under magnifying lamps, rejected vs approved trays. Industrial bright white lighting. White lab coats hanging on the side. Atmosphere: meticulous, careful, quality-focused.',
    motionHint: 'Background static. Magnifying lamp light beam may show subtle dust motes. Loop via stillness.',
    vibeTags: ['quality', 'authority', 'careful'],
    sortOrder: 9,
  },
  {
    slug: 'cold-storage-chiller',
    category: 'production',
    nameId: 'Cold Storage Chiller',
    nameEn: 'Cold Storage Chiller',
    description: 'Pintu chiller stainless + lampu biru samar. Cocok F&B segar, herbal segar.',
    promptFragment: 'Behind the host: row of large stainless steel chiller doors with cool blue ambient lighting reflecting off the metal surfaces. Floor: clean light tile. Some condensation mist near the chiller seams. Atmosphere: cold storage, freshness-preserved, food-grade.',
    motionHint: 'Condensation mist drifts very slowly upward from chiller seams. Light ambient blue tint subtle pulse (gentle). Loop seamless via subtle continuous mist.',
    vibeTags: ['freshness', 'food-grade', 'cold'],
    sortOrder: 10,
  },

  // C. Premium/Studio (11-15)
  {
    slug: 'studio-hitam-rim-light',
    category: 'premium',
    nameId: 'Studio Hitam Rim Light',
    nameEn: 'Black Studio Rim Light',
    description: 'Background hitam pekat + rim light biru/ungu. Produk highlight glow.',
    promptFragment: 'Pure black studio background with rim lighting (cool blue/purple) outlining the host from behind. Soft front fill light on the host. Floor invisible (black). Atmosphere: premium, dramatic, product hero.',
    motionHint: 'Background completely black — no movement. Rim light intensity may pulse very subtly (3-second cycle). Loop seamless via pulse phase.',
    vibeTags: ['premium', 'dramatic', 'hero'],
    sortOrder: 11,
  },
  {
    slug: 'pastel-solid-wall',
    category: 'premium',
    nameId: 'Dinding Pastel Polos',
    nameEn: 'Pastel Solid Wall',
    description: 'Dinding polos pink/peach/lavender. Minimalis beauty.',
    promptFragment: 'Soft pastel solid color wall background (peach, blush pink, or lavender). Smooth even lighting from front. Floor: same-tone polished or carpet. Atmosphere: clean, feminine, modern minimal.',
    motionHint: 'Wall completely static, no texture variation. Lighting consistent. Loop via stillness.',
    vibeTags: ['minimal', 'beauty', 'feminine', 'clean'],
    sortOrder: 12,
  },
  {
    slug: 'neon-sign-backdrop',
    category: 'premium',
    nameId: 'Neon Sign Backdrop',
    nameEn: 'Neon Sign Wall',
    description: 'Sign neon brand di dinding (pink/ungu). Gen-Z aesthetic.',
    promptFragment: 'Behind the host: dark matte wall with neon signs (pink, purple, electric blue) forming brand-style shapes or words. Soft purple/pink ambient glow on host. Atmosphere: gen-Z, trendy, vibrant nightlife shop.',
    motionHint: 'Neon signs glow steady but with very subtle flicker (random short dim every 4-6 sec, classic neon vibe). Loop seamless — flicker timing not at frame 1 or final frame.',
    vibeTags: ['gen-z', 'trendy', 'vibrant', 'nightlife'],
    sortOrder: 13,
  },
  {
    slug: 'led-rgb-panel-wall',
    category: 'premium',
    nameId: 'LED RGB Panel Wall',
    nameEn: 'LED RGB Panel Wall',
    description: 'Panel LED grid behind, color shifting subtle. Tech/modern vibe.',
    promptFragment: 'Behind the host: large grid of LED panels (like esports studio) showing subtle gradient pattern in tech-blue and purple. Slight color shift over time. Polished dark floor. Atmosphere: tech, gaming, modern.',
    motionHint: 'LED panel gradient shifts very slowly across the wall (~10 sec cycle from blue-purple to purple-blue and back). Smooth, no flicker. Loop seamless via cycle phase match.',
    vibeTags: ['tech', 'modern', 'gaming'],
    sortOrder: 14,
  },
  {
    slug: 'marble-gold-luxury',
    category: 'premium',
    nameId: 'Marble + Gold Luxury',
    nameEn: 'Marble Gold Accent',
    description: 'Dinding marble putih + gold trim. Luxury wellness/cosmetic.',
    promptFragment: 'Behind the host: white marble wall with veining, brass/gold accent trim (picture frames or vertical accent strips). Polished marble floor visible. Soft warm-white lighting with hint of gold reflection. Atmosphere: luxury, premium, spa-like.',
    motionHint: 'Background completely static. Gold reflection on marble may have very subtle shimmer in highlight areas. Loop via stillness.',
    vibeTags: ['luxury', 'premium', 'spa', 'wellness'],
    sortOrder: 15,
  },

  // D. Lifestyle/Personal (16-20)
  {
    slug: 'kamar-tidur-cozy',
    category: 'lifestyle',
    nameId: 'Kamar Tidur Cozy',
    nameEn: 'Cozy Bedroom',
    description: 'Kasur tertata + produk di nakas. "Host pakai sendiri" vibe.',
    promptFragment: 'Behind the host: cozy bedroom with neatly made bed (soft white linens), bedside table with small lamp and a few personal items, woven wall art or framed prints, soft warm lighting. Atmosphere: personal, intimate, "I use this every day".',
    motionHint: 'Background static. Lamp may have very subtle warm glow pulse. Loop via stillness.',
    vibeTags: ['personal', 'intimate', 'home', 'authentic'],
    sortOrder: 16,
  },
  {
    slug: 'dapur-rumahan',
    category: 'lifestyle',
    nameId: 'Dapur Rumahan',
    nameEn: 'Home Kitchen',
    description: 'Kabinet kayu + countertop kayu, vibe rumah. Cocok F&B/herbal.',
    promptFragment: 'Behind the host: home-style kitchen with wooden cabinets (light or natural wood), butcher block or wooden countertop with a few utensils (wooden spoons in jar, herbs in pot), maybe a tiled backsplash. Warm window light visible. Atmosphere: homey, edible, comfortable.',
    motionHint: 'Background static. Steam from kettle (if visible) drifts up slowly. Loop seamless via continuous steam.',
    vibeTags: ['homey', 'food', 'warm', 'authentic'],
    sortOrder: 17,
  },
  {
    slug: 'living-room-modern',
    category: 'lifestyle',
    nameId: 'Living Room Modern',
    nameEn: 'Modern Living Room',
    description: 'Sofa + plant + meja kopi. Lifestyle/decor.',
    promptFragment: 'Behind the host: contemporary living room with soft beige or terracotta sofa, large floor plant (monstera or fiddle leaf), coffee table with books and small decor. Natural daylight from large window. Modern minimal aesthetic.',
    motionHint: 'Plant leaves may sway very gently as if from light breeze. Otherwise static. Loop seamless via continuous gentle sway.',
    vibeTags: ['lifestyle', 'modern', 'home', 'decor'],
    sortOrder: 18,
  },
  {
    slug: 'cafe-interior',
    category: 'lifestyle',
    nameId: 'Cafe Interior',
    nameEn: 'Cafe Interior',
    description: 'Meja kayu + jendela bias matahari. Vibe creator coffee shop.',
    promptFragment: 'Behind the host: cafe interior with wooden table, espresso machine visible far in background, hanging Edison-bulb lights, exposed brick wall, large window letting in golden afternoon light. Plants in copper pots. Atmosphere: creator, hipster, intentional.',
    motionHint: 'Background mostly static. Steam from espresso area visible drifting upward. Hanging bulbs may sway very subtly. Loop seamless via continuous steam.',
    vibeTags: ['creator', 'hipster', 'warm', 'lifestyle'],
    sortOrder: 19,
  },
  {
    slug: 'bokeh-fairy-lights',
    category: 'lifestyle',
    nameId: 'Bokeh Fairy Lights',
    nameEn: 'Warm Bokeh Fairy Lights',
    description: 'String lights warm di belakang, blur bokeh romantic.',
    promptFragment: 'Behind the host: out-of-focus warm white fairy lights creating bokeh circles. Dark backdrop with the lights as the main visual element. Atmosphere: dreamy, warm, intimate, magical.',
    motionHint: 'Bokeh lights twinkle very subtly — random gentle pulse on individual lights, no harsh flashing. Loop seamless via random soft pulse pattern.',
    vibeTags: ['dreamy', 'warm', 'intimate', 'romantic'],
    sortOrder: 20,
  },

  // E. Specialty/Contextual (21-25)
  {
    slug: 'showroom-display',
    category: 'specialty',
    nameId: 'Showroom Display',
    nameEn: 'Showroom Display',
    description: 'Dinding rak terorganisir produk multi-SKU. Katalog vibe.',
    promptFragment: 'Behind the host: organized retail showroom shelves displaying various product SKUs neatly arranged with price tags, category dividers. Track lighting highlighting each shelf. Polished floor. Atmosphere: organized retail, catalog browser, multi-brand.',
    motionHint: 'Background completely static. Track lighting consistent. Loop via stillness.',
    vibeTags: ['retail', 'organized', 'catalog'],
    sortOrder: 21,
  },
  {
    slug: 'atelier-garment-rack',
    category: 'specialty',
    nameId: 'Atelier Garment Rack',
    nameEn: 'Atelier Garment Rack',
    description: 'Gantungan baju + cermin besar. Cocok fashion/hijab.',
    promptFragment: 'Behind the host: fashion atelier with garment racks holding hanging clothes (dresses, hijab options), large standing mirror, mannequin. Soft natural daylight. Atmosphere: fashion, style, curated.',
    motionHint: 'Garments may sway very subtly as if light air movement. Mirror reflection static. Loop seamless via continuous subtle sway.',
    vibeTags: ['fashion', 'style', 'feminine'],
    sortOrder: 22,
  },
  {
    slug: 'gym-sport-equipment',
    category: 'specialty',
    nameId: 'Gym Sport Equipment',
    nameEn: 'Gym Equipment',
    description: 'Alat olahraga blur di belakang. Fitness/supplement.',
    promptFragment: 'Behind the host: gym setting with weight racks, treadmill, exercise mats visible (defocused/blurred). Bright modern gym lighting. Polished rubber floor. Atmosphere: fitness, active, healthy.',
    motionHint: 'Background mostly static. Treadmill belt (if visible) running continuously at steady speed. Loop seamless via treadmill belt phase.',
    vibeTags: ['fitness', 'active', 'health'],
    sortOrder: 23,
  },
  {
    slug: 'garden-greenhouse',
    category: 'specialty',
    nameId: 'Garden Greenhouse',
    nameEn: 'Garden Greenhouse',
    description: 'Tanaman + sunlight. Herbal/plant/wellness.',
    promptFragment: 'Behind the host: greenhouse or indoor garden with various potted plants (herbs, tropical, succulents) on tiered wooden shelves. Bright natural sunlight streaming through glass roof. Atmosphere: lush, natural, healing.',
    motionHint: 'Plant leaves sway gently as if from soft breeze. Sunlight stays consistent. Loop seamless via continuous gentle sway.',
    vibeTags: ['natural', 'healing', 'plant', 'wellness'],
    sortOrder: 24,
  },
  {
    slug: 'pasar-tradisional',
    category: 'specialty',
    nameId: 'Pasar Tradisional',
    nameEn: 'Traditional Indo Market',
    description: 'Rak warung + neon stiker harga. Vibe SKU autentik lokal.',
    promptFragment: 'Behind the host: traditional Indonesian warung/toko style with packed shelves of various sachet/bottle products (Indomie, kecap, sambal, snack), bright neon yellow price stickers, fluorescent tube lighting. Tiled wall background. Atmosphere: authentic local SKU, neighborhood shop.',
    motionHint: 'Background completely static. Fluorescent flicker may show subtle ambient inconsistency. Loop via stillness.',
    vibeTags: ['authentic', 'local', 'indo', 'familiar'],
    sortOrder: 25,
  },
]

// ─────────────────────────────────────────
// 50 VISUAL HOOK PRESETS (riset TikTok ID viral)
// ─────────────────────────────────────────

interface VisualHookSeed {
  slug: string
  category: 'costume' | 'headwear' | 'prop' | 'accessory' | 'cosplay'
  nameId: string
  description: string
  promptFragment: string
  stabilityHints: string[]
  vibeTags: string[]
  cautionFlags: string[]
  sortOrder: number
}

const VISUAL_HOOKS: VisualHookSeed[] = [
  // A. Theme Costume (1-15)
  { slug: 'baju-badut', category: 'costume', nameId: 'Baju Badut', description: 'Kostum clown warna-warni, hidung merah, kerah ruffle besar', promptFragment: 'wearing a vibrant clown costume: colorful polka-dot tunic, large white ruffle collar around the neck, red round clown nose, exaggerated colorful suspenders. Playful, fun expression', stabilityHints: ['red clown nose must remain centered on nose throughout', 'ruffle collar may bob very gently with body but not flap', 'costume colors stay vivid no fading'], vibeTags: ['playful', 'fun', 'attention-grab'], cautionFlags: [], sortOrder: 1 },
  { slug: 'koboi-lengkap', category: 'costume', nameId: 'Koboi Lengkap', description: 'Topi koboy, rompi kulit, dasi bandana, ikat pinggang besar', promptFragment: 'wearing a complete cowboy outfit: brown leather cowboy hat, red bandana tied at neck, brown leather vest over white shirt, large silver belt buckle, denim or canvas pants. Confident posture', stabilityHints: ['cowboy hat brim must not shift or wobble', 'bandana stays tied at neck position', 'vest stays buttoned same way'], vibeTags: ['cool', 'attention-grab', 'memorable'], cautionFlags: [], sortOrder: 2 },
  { slug: 'pirat', category: 'costume', nameId: 'Pirat', description: 'Bandana bajak laut, eyepatch, baju strip', promptFragment: 'wearing pirate outfit: black bandana tied around head, black eyepatch over one eye, white-and-red horizontal striped shirt, leather brown vest. Playful menacing vibe', stabilityHints: ['eyepatch must stay over same eye throughout', 'bandana stays tied', 'stripes pattern consistent'], vibeTags: ['playful', 'adventure'], cautionFlags: [], sortOrder: 3 },
  { slug: 'polisi-lalu-lintas', category: 'costume', nameId: 'Polisi Lalu Lintas', description: 'Seragam putih biru, peluit, helm putih', promptFragment: 'wearing Indonesian traffic police uniform: white shirt with navy blue shoulder boards, white peaked cap with police insignia, whistle on lanyard, badge visible. Authoritative posture', stabilityHints: ['cap stays straight on head', 'whistle hangs at chest position', 'uniform consistent'], vibeTags: ['authority', 'serious'], cautionFlags: ['cultural-sensitive'], sortOrder: 4 },
  { slug: 'dokter-putih', category: 'costume', nameId: 'Dokter Putih', description: 'Jas lab putih + stetoskop tergantung leher', promptFragment: 'wearing white doctor lab coat over professional shirt, stethoscope draped around neck hanging at chest level, name badge clipped on left chest pocket. Professional, trustworthy demeanor', stabilityHints: ['stethoscope stays around neck and at chest', 'lab coat stays buttoned', 'name badge in same position'], vibeTags: ['authority', 'credibility', 'health'], cautionFlags: [], sortOrder: 5 },
  { slug: 'chef-profesional', category: 'costume', nameId: 'Chef Profesional', description: 'Apron putih, topi chef tinggi, scarf leher', promptFragment: 'wearing professional chef outfit: white double-breasted chef coat, tall white pleated chef hat (toque), white kerchief at neck, clean white apron. Confident culinary expert vibe', stabilityHints: ['chef hat stays upright on head', 'apron ties stay fastened', 'chef coat buttons stay in position'], vibeTags: ['expertise', 'culinary'], cautionFlags: [], sortOrder: 6 },
  { slug: 'astronot', category: 'costume', nameId: 'Astronot', description: 'Kostum NASA putih dengan emblem', promptFragment: 'wearing white astronaut spacesuit with NASA-style emblem on left chest, flag patch on right shoulder, multiple zip pockets, oxygen tube attachments at chest level. Helmet OFF (visible face)', stabilityHints: ['emblems and patches stay in fixed positions', 'oxygen attachments visible same way', 'suit white stays clean'], vibeTags: ['cool', 'unique', 'memorable'], cautionFlags: [], sortOrder: 7 },
  { slug: 'pak-tani', category: 'costume', nameId: 'Pak Tani', description: 'Caping anyaman, baju hem coklat, cangkul/sabit', promptFragment: 'wearing Indonesian farmer outfit: wide-brim caping (woven straw conical hat), brown long-sleeve work shirt, scarf around neck, sabit (curved sickle) holding by hand. Earthy authentic vibe', stabilityHints: ['caping stays balanced on head, brim consistent', 'sickle stays in hand same position', 'scarf stays at neck'], vibeTags: ['authentic', 'local', 'humble'], cautionFlags: [], sortOrder: 8 },
  { slug: 'stewardess', category: 'costume', nameId: 'Stewardess', description: 'Uniform pramugari, scarf leher, name tag', promptFragment: 'wearing flight attendant uniform: navy blue blazer with silver buttons, silk scarf in branded pattern around neck, white blouse underneath, name tag pinned on right lapel. Polished, professional', stabilityHints: ['scarf knot stays tied same way', 'name tag in fixed position', 'blazer buttoned consistent'], vibeTags: ['polished', 'professional', 'travel'], cautionFlags: [], sortOrder: 9 },
  { slug: 'pelaut-tni-al', category: 'costume', nameId: 'Pelaut Sailor', description: 'Uniform putih sailor, topi pelaut', promptFragment: 'wearing classic sailor uniform: white long-sleeve top with blue and white sailor collar showing at neck, white sailor cap (round) on head, gold trim accents. Crisp clean nautical look', stabilityHints: ['sailor cap stays centered on head', 'sailor collar stays flat', 'gold trim consistent'], vibeTags: ['nautical', 'classic', 'fresh'], cautionFlags: [], sortOrder: 10 },
  { slug: 'penyihir', category: 'costume', nameId: 'Penyihir', description: 'Jubah bintang, topi cone tinggi, tongkat', promptFragment: 'wearing wizard outfit: deep purple or midnight blue robe covered in gold star and moon patterns, tall pointed conical wizard hat in matching pattern, holding a wooden wand or staff. Mystical vibe', stabilityHints: ['wizard hat point stays upward, no tilt', 'wand stays in hand same position', 'robe star pattern consistent'], vibeTags: ['playful', 'magical', 'memorable'], cautionFlags: [], sortOrder: 11 },
  { slug: 'penari-bali', category: 'costume', nameId: 'Penari Bali', description: 'Kostum tradisional Bali, mahkota emas', promptFragment: 'wearing traditional Balinese dancer costume: ornate gold-embroidered crown headpiece (gelungan), red and gold sarong, intricate gold patterns on the bodice. Elegant traditional Indonesian dance attire', stabilityHints: ['gold crown stays balanced on head', 'crown ornaments stay attached', 'costume pattern consistent'], vibeTags: ['cultural', 'elegant', 'indo'], cautionFlags: ['cultural-sensitive'], sortOrder: 12 },
  { slug: 'pejuang-1945', category: 'costume', nameId: 'Pejuang 1945', description: 'Peci putih, baju kemerdekaan, tas selempang', promptFragment: 'wearing Indonesian 1945 freedom fighter outfit: white peci (traditional cap) on head, simple beige or off-white kemeja, leather strap bag across chest, optional bamboo runcing in hand', stabilityHints: ['peci stays straight on head', 'strap of bag stays across chest', 'kemeja buttoned consistent'], vibeTags: ['patriotic', 'historic', 'indo'], cautionFlags: ['cultural-sensitive'], sortOrder: 13 },
  { slug: 'karyawan-formal', category: 'costume', nameId: 'Karyawan Kantor Formal', description: 'Jas hitam + dasi, vibe profesional', promptFragment: 'wearing formal office attire: well-tailored black or charcoal suit jacket, crisp white dress shirt, classic tie (red, navy, or burgundy), polished. Sharp professional executive look', stabilityHints: ['tie knot stays at collar', 'jacket buttoned same way', 'shirt collar consistent'], vibeTags: ['professional', 'authority'], cautionFlags: [], sortOrder: 14 },
  { slug: 'penari-reog', category: 'costume', nameId: 'Penari Reog', description: 'Topeng singa barong besar (auto attention)', promptFragment: 'wearing or holding (partially visible) traditional Reog Ponorogo barongan mask: enormous lion-head mask with peacock feather crown, fierce expression. Face partly visible behind/beside mask', stabilityHints: ['mask stays in same orientation, no rotation', 'peacock feathers stay arrayed', 'mask color consistent'], vibeTags: ['cultural', 'attention-grab', 'unique'], cautionFlags: ['cultural-sensitive', 'face-coverage'], sortOrder: 15 },

  // B. Headwear Statement (16-27)
  { slug: 'topi-koboy-solo', category: 'headwear', nameId: 'Topi Koboy (solo)', description: 'Topi koboy coklat klasik, fleksibel di outfit apa pun', promptFragment: 'wearing a brown leather classic cowboy hat with curved brim, well-fitted on head. Otherwise normal outfit', stabilityHints: ['hat brim curvature stays consistent', 'hat tilt consistent', 'leather texture visible'], vibeTags: ['cool', 'memorable'], cautionFlags: [], sortOrder: 16 },
  { slug: 'mahkota-ratu', category: 'headwear', nameId: 'Mahkota Ratu', description: 'Gold queen crown dengan permata', promptFragment: 'wearing an elaborate gold queen crown with multiple jewels (rubies, sapphires, diamonds), tall regal pointed peaks. Crown sits naturally on head', stabilityHints: ['crown stays balanced, jewels in fixed positions', 'crown peaks point upward', 'gold color consistent'], vibeTags: ['regal', 'premium', 'memorable'], cautionFlags: [], sortOrder: 17 },
  { slug: 'topi-chef-tinggi', category: 'headwear', nameId: 'Topi Chef Tinggi', description: 'Putih klasik, vibe kuliner', promptFragment: 'wearing a tall pleated white chef hat (toque), traditional culinary headwear', stabilityHints: ['chef hat pleats stay consistent', 'hat stays upright', 'white color clean'], vibeTags: ['culinary', 'expertise'], cautionFlags: [], sortOrder: 18 },
  { slug: 'topi-sinterklas', category: 'headwear', nameId: 'Topi Sinterklas', description: 'Merah putih (seasonal Christmas)', promptFragment: 'wearing red Santa Claus hat with white fluffy trim around base and white pompom at tip, falling slightly to one side. Festive', stabilityHints: ['Santa hat color stays red', 'white trim and pompom in fixed positions', 'hat tilt consistent'], vibeTags: ['festive', 'seasonal'], cautionFlags: ['seasonal-only'], sortOrder: 19 },
  { slug: 'topi-cone-party', category: 'headwear', nameId: 'Topi Cone Party', description: 'Warna-warni dengan pompom', promptFragment: 'wearing a colorful party cone hat with rainbow stripes and a small pompom at the top, secured with elastic chinstrap. Playful festive accessory', stabilityHints: ['cone tip points up', 'stripes pattern consistent', 'pompom in fixed position'], vibeTags: ['playful', 'celebration'], cautionFlags: [], sortOrder: 20 },
  { slug: 'topi-konstruksi', category: 'headwear', nameId: 'Topi Konstruksi Safety', description: 'Helmet kuning, work mode', promptFragment: 'wearing a bright yellow construction safety hard hat with brim and ratchet adjustment visible. Worker confidence vibe', stabilityHints: ['hard hat color bright yellow', 'brim consistent', 'orientation stable'], vibeTags: ['work', 'reliable'], cautionFlags: [], sortOrder: 21 },
  { slug: 'helm-motor-visor', category: 'headwear', nameId: 'Helm Motor Visor Terbuka', description: 'Racing/sport visor open', promptFragment: 'wearing a sport motorcycle helmet (full face style) with the visor flipped UP showing face. Helmet color: matte black or red, with racing decals', stabilityHints: ['visor stays in UP position throughout', 'helmet rim stays around face', 'decals consistent'], vibeTags: ['sport', 'cool', 'racing'], cautionFlags: [], sortOrder: 22 },
  { slug: 'headband-bunga-raksasa', category: 'headwear', nameId: 'Headband Bunga Raksasa', description: 'Bunga oranye/pink besar di sisi', promptFragment: 'wearing a large statement floral headband with one oversized hibiscus or sunflower (orange, pink, or red) positioned on one side of the head. Vibrant accent', stabilityHints: ['flower stays on same side of head', 'flower size consistent', 'headband stays in position'], vibeTags: ['feminine', 'tropical', 'vibrant'], cautionFlags: [], sortOrder: 23 },
  { slug: 'mahkota-duyung', category: 'headwear', nameId: 'Mahkota Duyung', description: 'Pearl + shell ornament', promptFragment: 'wearing a mermaid-style crown with pearls, seashells, and starfish ornaments arranged in a tiara shape. Pearl-blue accents', stabilityHints: ['crown ornaments stay attached', 'pearl positions fixed', 'crown stays balanced'], vibeTags: ['fantasy', 'feminine', 'memorable'], cautionFlags: [], sortOrder: 24 },
  { slug: 'caping-petani', category: 'headwear', nameId: 'Caping Petani', description: 'Caping anyaman besar', promptFragment: 'wearing a traditional Indonesian woven straw caping (conical wide-brim farmer hat). Natural beige color', stabilityHints: ['caping brim consistent', 'cone tip points up', 'straw texture visible'], vibeTags: ['authentic', 'local', 'humble'], cautionFlags: [], sortOrder: 25 },
  { slug: 'ikat-kepala-chef-indo', category: 'headwear', nameId: 'Ikat Kepala Chef Indo', description: 'Putih dengan logo, vibe warkop nusantara', promptFragment: 'wearing a folded white cloth headband (ikat kepala) tied around forehead, slight Indonesian street food vendor vibe', stabilityHints: ['headband stays tied at forehead', 'fold pattern consistent', 'white color clean'], vibeTags: ['authentic', 'culinary', 'local'], cautionFlags: [], sortOrder: 26 },
  { slug: 'topi-kepang-disney', category: 'headwear', nameId: 'Topi Kepang Putri', description: 'Disney princess style braided crown', promptFragment: 'hair styled into a braided crown wrapped around head, decorated with small flowers or pearls, princess-style elegant updo', stabilityHints: ['braid pattern consistent', 'flowers in fixed positions', 'hairstyle does not loose'], vibeTags: ['feminine', 'romantic', 'fantasy'], cautionFlags: [], sortOrder: 27 },

  // C. Hand-held Props (28-37)
  { slug: 'mic-emas-besar', category: 'prop', nameId: 'Mic Emas Besar', description: 'Vintage announcer style golden mic', promptFragment: 'holding a large vintage-style gold microphone with mesh head, classic radio announcer vibe, microphone raised to mouth level for emphasis', stabilityHints: ['mic stays in hand at mouth level', 'gold color stays bright', 'mic grip consistent'], vibeTags: ['announcer', 'attention-grab'], cautionFlags: [], sortOrder: 28 },
  { slug: 'megaphone-toa', category: 'prop', nameId: 'Megaphone Toa', description: 'Corong oranye besar', promptFragment: 'holding a large bright orange megaphone (toa) raised to mouth level, broadcasting announcement vibe', stabilityHints: ['megaphone stays in hand at mouth level', 'orange color vivid', 'horn shape consistent'], vibeTags: ['attention-grab', 'urgent'], cautionFlags: [], sortOrder: 29 },
  { slug: 'kalkulator-raksasa', category: 'prop', nameId: 'Kalkulator Raksasa', description: 'Sales math mode', promptFragment: 'holding a giant oversized calculator (size of a tablet) with large display showing some number, sales math demonstration vibe', stabilityHints: ['calculator stays in hand at chest level', 'display number consistent', 'calculator orientation stable'], vibeTags: ['sales', 'math', 'playful'], cautionFlags: [], sortOrder: 30 },
  { slug: 'spanduk-diskon', category: 'prop', nameId: 'Spanduk Diskon Raksasa', description: 'Kain merah "DISKON 90%"', promptFragment: 'holding up a large red fabric banner with bold yellow text reading "DISKON 90%" or similar discount message, stretched across body width', stabilityHints: ['banner stays held up by both hands', 'text remains legible', 'red color stays vivid'], vibeTags: ['urgent', 'sales', 'attention-grab'], cautionFlags: [], sortOrder: 31 },
  { slug: 'catalog-buku-besar', category: 'prop', nameId: 'Catalog Buku Besar', description: 'Buku tebal terbuka, vibe katalog', promptFragment: 'holding a large open product catalog book in both hands at chest level, showing colorful product pages inside', stabilityHints: ['book stays open and held in same orientation', 'pages stay visible', 'book size consistent'], vibeTags: ['catalog', 'browse', 'educational'], cautionFlags: [], sortOrder: 32 },
  { slug: 'boneka-mascot-brand', category: 'prop', nameId: 'Boneka Mascot Brand', description: 'Boneka mascot custom', promptFragment: 'holding a plush mascot character (cute generic mascot, e.g., small cartoon animal in matching costume color) at chest level', stabilityHints: ['mascot doll stays at chest level', 'orientation consistent', 'mascot details consistent'], vibeTags: ['friendly', 'playful'], cautionFlags: [], sortOrder: 33 },
  { slug: 'plushie-raksasa', category: 'prop', nameId: 'Plushie Raksasa', description: 'Boneka karakter besar dipeluk', promptFragment: 'hugging a giant plush stuffed animal (teddy bear or similar) almost half the size of the host, cuddly playful vibe', stabilityHints: ['plushie stays hugged at chest', 'plushie facial features consistent', 'size remains large'], vibeTags: ['playful', 'cute', 'cozy'], cautionFlags: [], sortOrder: 34 },
  { slug: 'bendera-brand', category: 'prop', nameId: 'Bendera Brand', description: 'Bendera tangan besar', promptFragment: 'holding a large hand-held brand flag on wooden pole, flag waving gently to one side, fabric in vivid color (red, gold)', stabilityHints: ['flag pole stays in hand', 'flag waves gently same direction', 'color consistent'], vibeTags: ['celebration', 'rally'], cautionFlags: [], sortOrder: 35 },
  { slug: 'bola-kristal', category: 'prop', nameId: 'Bola Kristal', description: 'Peramal mode, glowing', promptFragment: 'holding a glowing transparent crystal ball at chest level in both hands, mystical light glow from within', stabilityHints: ['crystal ball stays held in both hands at chest', 'glow consistent', 'ball orientation stable'], vibeTags: ['mystical', 'memorable', 'fortune-teller'], cautionFlags: [], sortOrder: 36 },
  { slug: 'sapu-lidi', category: 'prop', nameId: 'Sapu Lidi', description: 'Host kerja mode, sapu lantai', promptFragment: 'holding a traditional Indonesian broom (sapu lidi — bundled coconut leaf ribs broom), vibe of someone working/cleaning', stabilityHints: ['broom stays in hand', 'broom bundle shape consistent', 'orientation stable'], vibeTags: ['authentic', 'humble', 'local'], cautionFlags: [], sortOrder: 37 },

  // D. Accessories/Body Mod (38-45)
  { slug: 'sunglass-heart', category: 'accessory', nameId: 'Sunglass Heart', description: 'Frame hati pink/merah', promptFragment: 'wearing heart-shaped sunglasses with pink or red plastic frames, lenses slightly tinted. Playful Y2K accessory', stabilityHints: ['sunglasses stay on nose bridge', 'frame shape (heart) consistent', 'color consistent'], vibeTags: ['playful', 'gen-z', 'y2k'], cautionFlags: [], sortOrder: 38 },
  { slug: 'sunglass-pixel', category: 'accessory', nameId: 'Sunglass Pixel 8-bit', description: 'Black square pixel frames', promptFragment: 'wearing black square 8-bit pixel-style sunglasses with chunky frames, gaming/retro tech vibe', stabilityHints: ['sunglasses stay in position', 'pixel frame chunky look consistent', 'orientation stable'], vibeTags: ['gaming', 'retro', 'tech'], cautionFlags: [], sortOrder: 39 },
  { slug: 'kacamata-bulat-nerd', category: 'accessory', nameId: 'Kacamata Bulat Nerdy', description: 'Frame round Harry Potter style', promptFragment: 'wearing round wire-frame nerdy glasses (small round lenses, thin gold or black wire), academic intellectual vibe', stabilityHints: ['glasses stay on nose', 'round lens shape consistent', 'frame thin and consistent'], vibeTags: ['intellectual', 'nerdy', 'memorable'], cautionFlags: [], sortOrder: 40 },
  { slug: 'kumis-twirl', category: 'accessory', nameId: 'Kumis Palsu Twirl', description: 'Gaya gentleman dengan ujung melengkung', promptFragment: 'with a large fake handlebar moustache curled at the tips (gentleman style), prominently displayed under nose', stabilityHints: ['moustache stays attached under nose', 'curl shape at tips consistent', 'color (black) stays vivid'], vibeTags: ['playful', 'gentleman', 'memorable'], cautionFlags: [], sortOrder: 41 },
  { slug: 'janggut-santa', category: 'accessory', nameId: 'Janggut Santa', description: 'Janggut putih panjang', promptFragment: 'with a long white Santa-style fake beard covering chin and reaching mid-chest', stabilityHints: ['beard stays attached at chin and ears', 'beard length consistent', 'white color stays clean'], vibeTags: ['festive', 'seasonal', 'memorable'], cautionFlags: ['seasonal-only', 'face-coverage'], sortOrder: 42 },
  { slug: 'body-paint-glow', category: 'accessory', nameId: 'Body Paint Glow', description: 'Neon UV body paint subtle', promptFragment: 'with subtle neon glow accents on visible skin (cheekbones, neck) — UV-glow body paint in cyan or magenta strips. Soft glow visible in regular lighting', stabilityHints: ['paint stripes stay in same positions', 'glow intensity consistent', 'patterns do not smear'], vibeTags: ['unique', 'rave', 'gen-z'], cautionFlags: ['potential-blur'], sortOrder: 43 },
  { slug: 'bling-jewellery', category: 'accessory', nameId: 'Bling Jewellery Berlimpah', description: 'Kalung emas tumpuk-tumpuk', promptFragment: 'wearing multiple stacked gold chain necklaces with various pendants (cross, charm, dog tag), oversized gold rings on multiple fingers, gold watch. Hip-hop / luxury vibe', stabilityHints: ['necklaces stay layered same way', 'pendant positions consistent', 'gold color stays bright'], vibeTags: ['luxury', 'hip-hop', 'flashy'], cautionFlags: [], sortOrder: 44 },
  { slug: 'hijab-ornamen-mencolok', category: 'accessory', nameId: 'Hijab Ornamen Mencolok', description: 'Hijab dengan bordir bunga besar', promptFragment: 'wearing a hijab with prominent embroidered floral pattern (large rose or hibiscus motif) on the front-facing fold. Color: deep blue or burgundy with gold embroidery', stabilityHints: ['hijab embroidery position stays at front', 'hijab drape consistent', 'embroidery color stays vivid'], vibeTags: ['feminine', 'modest', 'ornate'], cautionFlags: [], sortOrder: 45 },

  // E. Character Cosplay (46-50)
  { slug: 'adventurer-explorer', category: 'cosplay', nameId: 'Adventurer Explorer', description: 'Topi explorer + cambuk (no IP)', promptFragment: 'wearing adventurer/explorer outfit: brown fedora-style explorer hat with wide brim, beige cargo shirt with multiple pockets, leather satchel slung across body, leather whip coiled at belt. Indiana-Jones-vibe but generic', stabilityHints: ['explorer hat stays on head', 'satchel strap across body', 'whip stays at belt'], vibeTags: ['adventure', 'mystery', 'memorable'], cautionFlags: [], sortOrder: 46 },
  { slug: 'detektif-sherlock', category: 'cosplay', nameId: 'Detektif Sherlock', description: 'Deerstalker hat + magnifier (no IP)', promptFragment: 'wearing detective outfit: brown deerstalker hat (with ear flaps), brown plaid Inverness cape over white shirt, holding a magnifying glass at chest level. Generic detective vibe', stabilityHints: ['deerstalker hat ear flaps stay positioned', 'cape drapes consistent', 'magnifying glass in hand'], vibeTags: ['mystery', 'intellectual', 'memorable'], cautionFlags: [], sortOrder: 47 },
  { slug: 'ninja-generic', category: 'cosplay', nameId: 'Ninja Generic', description: 'Pakaian hitam, ikat kepala merah (no IP)', promptFragment: 'wearing generic ninja outfit: all-black tunic with cross-strap belt, red headband tied around forehead with knot at side, leather wrist wraps. Stealthy posture (face visible, not masked)', stabilityHints: ['headband stays tied at forehead', 'belt straps stay crossed at chest', 'wrist wraps stay in position'], vibeTags: ['cool', 'stealth', 'memorable'], cautionFlags: [], sortOrder: 48 },
  { slug: 'fantasy-elf', category: 'cosplay', nameId: 'Fantasy Elf', description: 'Telinga panjang + mahkota daun (no IP)', promptFragment: 'as a fantasy elf: pointed elf ears prominently visible, leaf-and-flower crown circling head, flowing green or beige robe with leaf-pattern accents. Magical forest vibe', stabilityHints: ['elf ears stay pointed and visible', 'leaf crown stays balanced on head', 'robe drape consistent'], vibeTags: ['fantasy', 'magical', 'memorable'], cautionFlags: [], sortOrder: 49 },
  { slug: 'vampir', category: 'cosplay', nameId: 'Vampir', description: 'Jubah merah-hitam + taring (no IP)', promptFragment: 'as a vampire: dramatic high-collar black cape with deep red interior, slicked-back hair, small fangs visible at corners of mouth, pale skin tone with subtle dark eye makeup. Aristocratic vampire vibe', stabilityHints: ['cape collar stays raised', 'fangs visible same way', 'pale tone consistent'], vibeTags: ['dramatic', 'fantasy', 'memorable'], cautionFlags: ['potential-blur'], sortOrder: 50 },
]

async function seedBackgrounds() {
  console.log('[seed] Backgrounds: upserting 25 presets...')
  for (const bg of BACKGROUNDS) {
    await prisma.backgroundPreset.upsert({
      where: { slug: bg.slug },
      create: {
        slug: bg.slug,
        category: bg.category,
        nameId: bg.nameId,
        nameEn: bg.nameEn,
        description: bg.description,
        promptFragment: bg.promptFragment,
        motionHint: bg.motionHint,
        thumbnailUrl: `/uploads/presets/backgrounds/${bg.slug}.png`,
        vibeTags: bg.vibeTags,
        sortOrder: bg.sortOrder,
      },
      update: {
        category: bg.category,
        nameId: bg.nameId,
        nameEn: bg.nameEn,
        description: bg.description,
        promptFragment: bg.promptFragment,
        motionHint: bg.motionHint,
        vibeTags: bg.vibeTags,
        sortOrder: bg.sortOrder,
      },
    })
  }
  console.log(`[seed] Backgrounds: ${BACKGROUNDS.length} done.`)
}

async function seedVisualHooks() {
  console.log('[seed] VisualHooks: upserting 50 presets...')
  for (const vh of VISUAL_HOOKS) {
    await prisma.visualHookPreset.upsert({
      where: { slug: vh.slug },
      create: {
        slug: vh.slug,
        category: vh.category,
        nameId: vh.nameId,
        description: vh.description,
        promptFragment: vh.promptFragment,
        stabilityHints: vh.stabilityHints,
        vibeTags: vh.vibeTags,
        cautionFlags: vh.cautionFlags,
        thumbnailUrl: `/uploads/presets/hooks/${vh.slug}.png`,
        sortOrder: vh.sortOrder,
      },
      update: {
        category: vh.category,
        nameId: vh.nameId,
        description: vh.description,
        promptFragment: vh.promptFragment,
        stabilityHints: vh.stabilityHints,
        vibeTags: vh.vibeTags,
        cautionFlags: vh.cautionFlags,
        sortOrder: vh.sortOrder,
      },
    })
  }
  console.log(`[seed] VisualHooks: ${VISUAL_HOOKS.length} done.`)
}

async function main() {
  await seedBackgrounds()
  await seedVisualHooks()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
