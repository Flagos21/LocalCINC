import dayjs from '@/utils/dayjs'

function computeMode(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null
  }

  const counts = new Map()
  let topValue = null
  let topCount = 0

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue
    }

    const nextCount = (counts.get(value) ?? 0) + 1
    counts.set(value, nextCount)

    if (nextCount > topCount) {
      topValue = value
      topCount = nextCount
    }
  }

  return Number.isFinite(topValue) ? topValue : null
}

function getSecondsKey(date) {
  const utc = dayjs(date).utc()
  if (!utc.isValid()) {
    return null
  }
  return utc.hour() * 3600 + utc.minute() * 60 + utc.second()
}

export function buildDailyModeBaseline({
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

  const fallbackMode = computeMode(allValues)
  const modeBySecond = new Map()

  for (const [key, bucket] of valuesBySecond.entries()) {
    modeBySecond.set(key, computeMode(bucket))
  }

  const sortedEntries = Array.from(modeBySecond.entries())
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => a[0] - b[0])

  const sortedKeys = sortedEntries.map(([seconds]) => seconds)
  const sortedValues = sortedEntries.map(([, value]) => value)

  function interpolateBaseline(secondsKey) {
    if (!Number.isFinite(secondsKey)) {
      return Number.isFinite(fallbackMode) ? fallbackMode : null
    }

    if (!sortedKeys.length) {
      return Number.isFinite(fallbackMode) ? fallbackMode : null
    }

    if (sortedKeys.length === 1) {
      return sortedValues[0]
    }

    if (secondsKey <= sortedKeys[0]) {
      return sortedValues[0]
    }

    const lastIndex = sortedKeys.length - 1
    if (secondsKey >= sortedKeys[lastIndex]) {
      return sortedValues[lastIndex]
    }

    let low = 0
    let high = lastIndex

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const midKey = sortedKeys[mid]

      if (midKey === secondsKey) {
        return sortedValues[mid]
      }

      if (midKey < secondsKey) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    const upperIndex = Math.max(0, Math.min(sortedKeys.length - 1, low))
    const lowerIndex = Math.max(0, upperIndex - 1)

    const lowerKey = sortedKeys[lowerIndex]
    const upperKey = sortedKeys[upperIndex]
    const lowerValue = sortedValues[lowerIndex]
    const upperValue = sortedValues[upperIndex]

    if (!Number.isFinite(lowerValue) && !Number.isFinite(upperValue)) {
      return Number.isFinite(fallbackMode) ? fallbackMode : null
    }

    if (!Number.isFinite(lowerValue)) {
      return upperValue
    }

    if (!Number.isFinite(upperValue)) {
      return lowerValue
    }

    const span = upperKey - lowerKey

    if (span <= 0) {
      return lowerValue
    }

    const ratio = (secondsKey - lowerKey) / span
    return lowerValue + (upperValue - lowerValue) * ratio
  }

  return targetTimestamps
    .map((rawTimestamp) => {
      const secondsKey = getSecondsKey(rawTimestamp)
      const baselineValue = interpolateBaseline(secondsKey)

      const time = dayjs(rawTimestamp)
      const numericTime = time.isValid() ? time.valueOf() : Number(rawTimestamp)

      if (!Number.isFinite(numericTime)) {
        return null
      }

      return [numericTime, Number.isFinite(baselineValue) ? baselineValue : null]
    })
    .filter((entry) => Array.isArray(entry) && Number.isFinite(entry[0]))
}

export function buildDailyMedianBaseline(options = {}) {
  return buildDailyModeBaseline(options)
}
