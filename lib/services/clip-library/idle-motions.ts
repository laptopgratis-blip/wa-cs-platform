// 30 IDLE motion presets — pakai Kling image2video langsung (no TTS, no lipsync).
// Output: video silent dengan gerakan menarik untuk loop saat customer sepi.
// Kategori dibagi: subtle / playful / energetic / dance / interact.

export interface IdleMotionPreset {
  id: string
  label: string // ID label untuk UI
  category: 'subtle' | 'playful' | 'energetic' | 'dance' | 'interact'
  emoji: string
  prompt: string // motion prompt untuk Kling (English, specific physical action)
  durationSec: 5 | 10
}

export const IDLE_MOTIONS: IdleMotionPreset[] = [
  // SUBTLE — natural everyday motion (bisa dipakai background terus)
  {
    id: 'breathe-calm',
    label: 'Nafas tenang',
    category: 'subtle',
    emoji: '😌',
    prompt:
      'Host stands still with calm centered posture, chest rising and falling with natural breathing, eyes blinking softly, gentle micro head shifts. Hands rest at sides. Camera completely static. Silent video, mouth closed with soft smile.',
    durationSec: 5,
  },
  {
    id: 'head-tilt-side',
    label: 'Geleng kepala kecil',
    category: 'subtle',
    emoji: '🤔',
    prompt:
      'Host tilts head slowly to the right with curious expression, holds 2 seconds, tilts back to center, then to left with same curious vibe. Loops back to center by end. Hands stay relaxed. Mouth closed soft smile.',
    durationSec: 5,
  },
  {
    id: 'look-around',
    label: 'Liat sekeliling',
    category: 'subtle',
    emoji: '👀',
    prompt:
      'Host looks around curiously — eyes scan from far left to far right, head follows slightly, then turns attention back to camera with friendly look. Hands stay at sides.',
    durationSec: 5,
  },
  {
    id: 'stretch-arms',
    label: 'Stretching tangan',
    category: 'subtle',
    emoji: '🙆',
    prompt:
      'Host raises both arms straight up overhead in a big stretch, holds 2 seconds with subtle smile, then lowers arms back to sides. Body twists slightly during stretch. Returns to starting pose.',
    durationSec: 10,
  },
  {
    id: 'yawn-cute',
    label: 'Menguap cute',
    category: 'subtle',
    emoji: '🥱',
    prompt:
      'Host yawns cutely — mouth opens wide briefly with hand covering mouth, eyes close, head tilts back slightly, then settles back with content sleepy smile. Holds yawn 1 second.',
    durationSec: 5,
  },
  // PLAYFUL — playful gestures (peek-a-boo, wink, etc.)
  {
    id: 'peekaboo',
    label: 'Ngumpet → ngintip',
    category: 'playful',
    emoji: '🙈',
    prompt:
      'Host covers face with both hands hiding from camera, holds 2 seconds, then peeks through fingers playfully, finally drops hands with bright surprised smile saying "ah ada kamu!". Returns to neutral pose.',
    durationSec: 10,
  },
  {
    id: 'wink-camera',
    label: 'Kedipin kamera',
    category: 'playful',
    emoji: '😉',
    prompt:
      'Host smiles warmly, slowly winks right eye at camera with flirty playful smile, holds smile 1 second, then both eyes open again, blows a kiss with right hand, returns to neutral.',
    durationSec: 5,
  },
  {
    id: 'blow-kiss',
    label: 'Kirim ciuman',
    category: 'playful',
    emoji: '💋',
    prompt:
      'Host smiles cutely, brings right hand to lips, kisses fingers, then blows the kiss toward camera with bright smile, hand sweeps outward. Returns to neutral with smile.',
    durationSec: 5,
  },
  {
    id: 'air-heart',
    label: 'Bikin love',
    category: 'playful',
    emoji: '🫶',
    prompt:
      'Host smiles brightly, brings both hands together above head making big heart shape with arms, holds 2 seconds smiling, then drops arms back. Holds love sign with eye contact.',
    durationSec: 5,
  },
  {
    id: 'kpop-heart',
    label: 'K-pop finger heart',
    category: 'playful',
    emoji: '🤏',
    prompt:
      'Host makes Korean-style finger heart with right hand (thumb + index finger crossed), holds near face with cute smile, switches to left hand finger heart, holds with playful pout, returns to neutral.',
    durationSec: 5,
  },
  {
    id: 'thumbs-up-double',
    label: 'Two thumbs up',
    category: 'playful',
    emoji: '👍',
    prompt:
      'Host gives big confident two thumbs up gesture, both arms slightly forward, bright proud smile, holds 2 seconds, returns to neutral. Repeats once more.',
    durationSec: 5,
  },
  {
    id: 'peace-sign',
    label: 'Peace sign',
    category: 'playful',
    emoji: '✌️',
    prompt:
      'Host makes V peace sign with right hand near face cute pose, holds with playful smile, switches to left hand peace sign, then both hands peace sign at same time. Returns to neutral.',
    durationSec: 5,
  },
  {
    id: 'shrug-iduno',
    label: 'Shrug "ga tau"',
    category: 'playful',
    emoji: '🤷',
    prompt:
      'Host shrugs both shoulders up with palms up showing "I don\'t know" gesture, eyebrows raised with playful confused face, holds 1 second, then drops arms back smiling.',
    durationSec: 5,
  },
  {
    id: 'royal-wave',
    label: 'Wave kayak ratu',
    category: 'playful',
    emoji: '👋',
    prompt:
      'Host smiles regally, waves slowly side to side with right hand like a queen greeting subjects, hand at face level. Switches to elegant left hand wave. Returns to neutral.',
    durationSec: 5,
  },
  {
    id: 'mind-blown',
    label: 'Pikiran meledak',
    category: 'playful',
    emoji: '🤯',
    prompt:
      'Host shows shocked surprised face, both hands rise to sides of head, fingers spread out making "mind blown" gesture, mouth drops open in O shape with wide eyes, holds 2 seconds, hands drop back smiling.',
    durationSec: 5,
  },
  // ENERGETIC — fitness/martial arts vibes
  {
    id: 'mini-jump',
    label: 'Lompat ditempat',
    category: 'energetic',
    emoji: '🦘',
    prompt:
      'Host does small joyful jumps in place — both feet leave ground briefly with bouncy energy, arms swing naturally, bright smile, lands and jumps again. 2 jumps total, returns to standing pose with big smile.',
    durationSec: 5,
  },
  {
    id: 'kungfu-stance',
    label: 'Kungfu stance',
    category: 'energetic',
    emoji: '🥋',
    prompt:
      'Host strikes kungfu opening stance — feet wider than shoulders, both hands raised in martial arts ready position, intense focused look, then throws a quick straight punch with right hand at camera, recovers to stance, returns to neutral.',
    durationSec: 10,
  },
  {
    id: 'boxing-jab',
    label: 'Boxing jab',
    category: 'energetic',
    emoji: '🥊',
    prompt:
      'Host stands boxing ready stance, throws quick right jab punch toward camera, then left jab, then right hook, returns to guard position, then ducks slightly bouncy. Returns to neutral with grin.',
    durationSec: 10,
  },
  {
    id: 'karate-chop',
    label: 'Karate chop',
    category: 'energetic',
    emoji: '🤺',
    prompt:
      'Host bows briefly, then makes karate chop motion with right hand cutting through air, follows with knee kick raise (knee up to chest), final hand chop. Returns to neutral pose.',
    durationSec: 5,
  },
  {
    id: 'run-back-return',
    label: 'Lari mundur → balik',
    category: 'energetic',
    emoji: '🏃',
    prompt:
      'Host turns around quickly, takes 3 steps backward away from camera (appears to run), then turns around fast and runs back forward 3 steps to original position, breathless smile, returns to neutral.',
    durationSec: 10,
  },
  {
    id: 'jumping-jacks',
    label: 'Jumping jacks',
    category: 'energetic',
    emoji: '🤸',
    prompt:
      'Host does 2 jumping jacks — arms swing up overhead while legs spread, then back down. Energetic bouncy fitness vibe, big smile throughout. Returns to standing.',
    durationSec: 5,
  },
  // DANCE — dance moves
  {
    id: 'tiktok-shuffle',
    label: 'TikTok shuffle',
    category: 'dance',
    emoji: '💃',
    prompt:
      'Host does signature TikTok dance — body sways side to side with rhythm, hands move in coordinated wave motion, hips bounce slightly, head bobs with beat. Cute fun dance vibe. 3 dance cycles total.',
    durationSec: 10,
  },
  {
    id: 'disco-point',
    label: 'Disco point',
    category: 'dance',
    emoji: '🕺',
    prompt:
      'Host does Saturday Night Fever disco move — right arm points up to ceiling then down across body diagonally, hips swing, switches arm, repeats with confident swagger. Returns to neutral with grin.',
    durationSec: 5,
  },
  {
    id: 'bollywood-spin',
    label: 'Bollywood spin',
    category: 'dance',
    emoji: '🪩',
    prompt:
      'Host does Bollywood-style spin — both hands raised, twirls around once gracefully, returns to facing camera with smile and final hand flourish at face level. Returns to neutral.',
    durationSec: 5,
  },
  {
    id: 'shoulder-shimmy',
    label: 'Shoulder shimmy',
    category: 'dance',
    emoji: '💃',
    prompt:
      'Host does playful shoulder shimmy — shoulders alternately bounce up and down rapidly, hands at hips, hips sway too, big smile and eye contact with camera. Returns to neutral.',
    durationSec: 5,
  },
  // INTERACT — directly interact with viewer
  {
    id: 'phone-call-mime',
    label: 'Mime telepon',
    category: 'interact',
    emoji: '📞',
    prompt:
      'Host mimes holding phone to ear with right hand thumb-pinky pose, talks excitedly, eyes wide with surprised reaction "oh ya?", then points at camera grinning "nih buat kamu!", drops hand back.',
    durationSec: 10,
  },
  {
    id: 'whisper-lean',
    label: 'Bisik ke kamera',
    category: 'interact',
    emoji: '🤫',
    prompt:
      'Host leans forward toward camera conspiratorially, cups right hand near mouth like sharing secret, eyes glance left and right playfully, returns upright with finger to lips "shh", drops finger smiling.',
    durationSec: 5,
  },
  {
    id: 'come-closer',
    label: 'Beckon "sini sini"',
    category: 'interact',
    emoji: '👋',
    prompt:
      'Host smiles warmly, beckons with both hands (palm up, finger curl motion) inviting viewer closer, repeats beckoning gesture 3 times saying "sini sini", then nods welcomingly. Returns to neutral.',
    durationSec: 5,
  },
  {
    id: 'wait-impatient',
    label: 'Tunggu (sambil ngeklik jari)',
    category: 'interact',
    emoji: '⏱️',
    prompt:
      'Host looks at imaginary wristwatch on left hand, taps watch impatiently, taps foot, looks back at camera with playful "kapan nih?" expression eyebrows raised, smiles. Returns to neutral.',
    durationSec: 5,
  },
  {
    id: 'salute-soldier',
    label: 'Salute hormat',
    category: 'interact',
    emoji: '🫡',
    prompt:
      'Host stands straight, snaps right hand to forehead in crisp military salute, holds 2 seconds with serious face, then breaks into playful smile, drops hand and gives playful wink. Returns to neutral.',
    durationSec: 5,
  },
]

export function getIdleMotionById(id: string): IdleMotionPreset | undefined {
  return IDLE_MOTIONS.find((m) => m.id === id)
}

export const IDLE_MOTION_CATEGORIES: Array<{
  value: IdleMotionPreset['category']
  label: string
  emoji: string
}> = [
  { value: 'subtle', label: 'Subtle', emoji: '😌' },
  { value: 'playful', label: 'Playful', emoji: '😉' },
  { value: 'energetic', label: 'Energetic', emoji: '🥋' },
  { value: 'dance', label: 'Dance', emoji: '💃' },
  { value: 'interact', label: 'Interact', emoji: '🫡' },
]
