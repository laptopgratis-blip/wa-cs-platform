import assert from 'node:assert'

import {
  ORDER_FORM_LIMIT_PER_USER,
  resolveOrderFormLimit,
} from './order-form'

// POWER & admin bypass = unlimited (null); tier lain kena limit 20.
assert.equal(resolveOrderFormLimit('POWER'), null)
assert.equal(resolveOrderFormLimit('ADMIN'), null)
assert.equal(resolveOrderFormLimit('POPULAR'), ORDER_FORM_LIMIT_PER_USER)
assert.equal(resolveOrderFormLimit('STARTER'), ORDER_FORM_LIMIT_PER_USER)
assert.equal(resolveOrderFormLimit('FREE'), ORDER_FORM_LIMIT_PER_USER)
assert.equal(resolveOrderFormLimit('UNKNOWN'), ORDER_FORM_LIMIT_PER_USER) // tier tak dikenal → tetap terbatas

console.log('order-form-limit ok')
