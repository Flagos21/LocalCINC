import dayjs from '@/utils/dayjs'

function computeMedian(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null
  }

  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (!sorted.length) {
    return null
  }

  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }

  return sorted[mid]
}

function getSecondsKey(date) {
  const utc = dayjs(date).utc()
  if (!utc.isValid()) {
    return null
  }
  return utc.hour() * 3600 + utc.minute() * 60 + utc.second()
}

export function buildDailyMedianBaseline({
  referenceTimestamps = [],
  referenceValues = [],
  targetTimestamps = []
} = {}) {
  if (!Array.isArray(referenceTimestamps) || !Array.isArray(referenceValues) || !Array.isArray(targetTimestamps)) {
    return []
  }

  const valuesBySecond = new Map()
  const allValues = []

  for (let index = 0; index < referenceTimestamps.length; index += 1) {
    const timestamp = referenceTimestamps[index]
    const rawValue = referenceValues[index]
    const value = Number(rawValue)

    if (!Number.isFinite(value)) {
      continue
    }

    const secondsKey = getSecondsKey(timestamp)
    if (secondsKey === null) {
      continue
    }

    let bucket = valuesBySecond.get(secondsKey)
    if (!bucket) {
      bucket = []
      valuesBySecond.set(secondsKey, bucket)
    }

    bucket.push(value)
    allValues.push(value)
  }

  const fallbackMedian = computeMedian(allValues)
  const medianBySecond = new Map()

  for (const [key, bucket] of valuesBySecond.entries()) {
    medianBySecond.set(key, computeMedian(bucket))
  }

  return targetTimestamps
    .map((rawTimestamp) => {
      const secondsKey = getSecondsKey(rawTimestamp)
      const baselineValue = secondsKey !== null && medianBySecond.has(secondsKey)
        ? medianBySecond.get(secondsKey)
        : fallbackMedian

      const time = dayjs(rawTimestamp)
      const numericTime = time.isValid() ? time.valueOf() : Number(rawTimestamp)

      if (!Number.isFinite(numericTime)) {
        return null
      }

      return [numericTime, Number.isFinite(baselineValue) ? baselineValue : null]
    })
    .filter((entry) => Array.isArray(entry) && Number.isFinite(entry[0]))
}
