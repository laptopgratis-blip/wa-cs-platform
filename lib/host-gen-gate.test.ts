import assert from 'node:assert'

import { hostTierAllowed } from './host-gen-gate'

// Host AI mulai paket Popular: FREE & STARTER diblok, POPULAR & POWER lolos.
assert.equal(hostTierAllowed('FREE'), false)
assert.equal(hostTierAllowed('STARTER'), false)
assert.equal(hostTierAllowed('POPULAR'), true)
assert.equal(hostTierAllowed('POWER'), true)
assert.equal(hostTierAllowed('UNKNOWN'), false) // tier tak dikenal → tolak

console.log('host-gen-gate ok')
