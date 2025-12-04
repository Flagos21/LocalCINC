import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildDailyMedianBaseline } from '../src/utils/baseline.js'

const DAY_MS = 24 * 60 * 60 * 1000

function makeTimestamp(dayOffset, withinDayMs = 0) {
  return Date.UTC(2024, 0, 1) + (dayOffset * DAY_MS) + withinDayMs
}

describe('buildDailyMedianBaseline', () => {
  it('returns a constant baseline when all reference days match', () => {
    const timestamps = []
    const values = []

    for (let day = 0; day < 7; day += 1) {
      timestamps.push(makeTimestamp(day, 0))
      values.push(1)
    }

    const targets = [makeTimestamp(7, 0), makeTimestamp(7, 60_000)]
    const result = buildDailyMedianBaseline({
      referenceTimestamps: timestamps,
      referenceValues: values,
      targetTimestamps: targets,
      bucketSizeMs: 60_000
    })

    assert.deepEqual(result.map(([, value]) => value), [1, 1])
  })

  it('ignores single-day outliers when computing the typical value', () => {
    const timestamps = []
    const values = []

    for (let day = 0; day < 7; day += 1) {
      timestamps.push(makeTimestamp(day, 0))
      values.push(day === 3 ? 100 : 5)
    }

    const result = buildDailyMedianBaseline({
      referenceTimestamps: timestamps,
      referenceValues: values,
      targetTimestamps: [makeTimestamp(7, 0)],
      bucketSizeMs: 60_000
    })

    assert.equal(result[0][1], 5)
  })

  it('works with partial buckets across days', () => {
    const timestamps = []
    const values = []

    // Only four days have data for this bucket
    for (let day = 0; day < 7; day += 1) {
      if (day % 2 === 0) {
        timestamps.push(makeTimestamp(day, 0))
        values.push(2)
      }
    }

    const result = buildDailyMedianBaseline({
      referenceTimestamps: timestamps,
      referenceValues: values,
      targetTimestamps: [makeTimestamp(7, 0)],
      bucketSizeMs: 60_000
    })

    assert.equal(result[0][1], 2)
  })

  it('interpolates between neighbor buckets', () => {
    const timestamps = [
      makeTimestamp(0, 0),
      makeTimestamp(0, 120_000),
      makeTimestamp(1, 0),
      makeTimestamp(1, 120_000)
    ]
    const values = [0, 10, 0, 10]

    const result = buildDailyMedianBaseline({
      referenceTimestamps: timestamps,
      referenceValues: values,
      targetTimestamps: [makeTimestamp(7, 60_000)],
      bucketSizeMs: 60_000
    })

    assert.equal(result[0][1], 5)
  })

  it('returns nulls when no reference data exists', () => {
    const target = makeTimestamp(0, 0)
    const result = buildDailyMedianBaseline({
      referenceTimestamps: [],
      referenceValues: [],
      targetTimestamps: [target],
      bucketSizeMs: 60_000
    })

    assert.equal(result.length, 1)
    assert.equal(result[0][1], null)
  })
})
