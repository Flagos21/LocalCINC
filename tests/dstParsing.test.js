import { strict as assert } from 'node:assert'
import test from 'node:test'

import { __testParseDstText } from '../api/services/dstService.js'

test('Kyoto DST header maps hourly slots to UTC timestamps without one-hour lag', () => {
  const hourlyValues = Array.from({ length: 24 }, (_, index) => `+${String(index + 1).padStart(2, '0')}`)
  const sample = `DST2411*05 RRX 000 ${hourlyValues.join(' ')} 9999999999`

  const result = __testParseDstText(sample)

  assert.equal(result.length, 24, 'should include 24 hourly values')

  const first = result[0]
  assert.equal(first.time, '2024-11-05T01:00:00.000Z')
  assert.equal(first.value, 1)

  const penultimate = result[result.length - 2]
  assert.equal(penultimate.time, '2024-11-05T23:00:00.000Z')
  assert.equal(penultimate.value, 23)

  const last = result[result.length - 1]
  assert.equal(last.time, '2024-11-06T00:00:00.000Z')
  assert.equal(last.value, 24)
})
