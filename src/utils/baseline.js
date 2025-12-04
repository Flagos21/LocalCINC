import dayjs from './dayjs.js'

const DEFAULT_BUCKET_MS = 1000
const DEFAULT_ROUNDING_DECIMALS = 3

function computeMedian(values = []) {
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

function computeMode(values = [], roundingDecimals = DEFAULT_ROUNDING_DECIMALS) {
  if (!Array.isArray(values) || values.length === 0) {
    return null
  }

  const decimals = Number.isInteger(roundingDecimals) && roundingDecimals >= 0
    ? roundingDecimals
    : DEFAULT_ROUNDING_DECIMALS

  const counts = new Map()

  for (const raw of values) {
    if (!Number.isFinite(raw)) continue

    const rounded = Number(raw.toFixed(decimals))
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1)
  }

  if (!counts.size) {
    return null
  }

  let maxCount = -Infinity
  const candidates = []

  for (const [value, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count
      candidates.length = 0
      candidates.push(value)
    } else if (count === maxCount) {
      candidates.push(value)
    }
  }

  if (candidates.length === 1) {
    return candidates[0]
  }

  return computeMedian(candidates)
}

function getBucketKey(timestamp, bucketSizeMs = DEFAULT_BUCKET_MS) {
  const utc = dayjs(timestamp).utc()
  if (!utc.isValid()) {
    return null
  }

  const size = Number.isFinite(bucketSizeMs) && bucketSizeMs > 0 ? bucketSizeMs : DEFAULT_BUCKET_MS
  const startOfDay = utc.startOf('day')
  const offsetMs = utc.valueOf() - startOfDay.valueOf()

  return Math.floor(offsetMs / size) * size
}

function aggregateBucket(daysMap, roundingDecimals) {
  const dailyAggregates = []

  for (const values of daysMap.values()) {
    const aggregate = computeMode(values, roundingDecimals) ?? computeMedian(values)
    if (Number.isFinite(aggregate)) {
      dailyAggregates.push(aggregate)
    }
  }

  if (!dailyAggregates.length) {
    return { typicalValue: null, dailyAggregates: [] }
  }

  const typicalValue = computeMode(dailyAggregates, roundingDecimals) ?? computeMedian(dailyAggregates)
  return { typicalValue, dailyAggregates }
}

export function buildDailyMedianBaseline({
  referenceTimestamps = [],
  referenceValues = [],
  targetTimestamps = [],
  bucketSizeMs = DEFAULT_BUCKET_MS,
  roundingDecimals = DEFAULT_ROUNDING_DECIMALS
} = {}) {
  if (!Array.isArray(referenceTimestamps) || !Array.isArray(referenceValues) || !Array.isArray(targetTimestamps)) {
    return []
  }

  const valuesByBucket = new Map()
  const allDailyAggregates = []
  const numericReferenceValues = []

  for (let index = 0; index < referenceTimestamps.length; index += 1) {
    const timestamp = referenceTimestamps[index]
    const rawValue = referenceValues[index]
    const value = Number(rawValue)

    if (!Number.isFinite(value)) {
      continue
    }

    const bucketKey = getBucketKey(timestamp, bucketSizeMs)
    if (bucketKey === null) {
      continue
    }

    numericReferenceValues.push(value)

    let bucket = valuesByBucket.get(bucketKey)
    if (!bucket) {
      bucket = new Map()
      valuesByBucket.set(bucketKey, bucket)
    }

    const dayKey = dayjs(timestamp).utc().startOf('day').valueOf()
    const dailyValues = bucket.get(dayKey) ?? []
    dailyValues.push(value)
    bucket.set(dayKey, dailyValues)
  }

  const typicalByBucket = new Map()

  for (const [bucketKey, bucketValues] of valuesByBucket.entries()) {
    const { typicalValue, dailyAggregates } = aggregateBucket(bucketValues, roundingDecimals)

    if (!Number.isFinite(typicalValue)) {
      continue
    }

    if (dailyAggregates.length) {
      allDailyAggregates.push(...dailyAggregates)
    }

    typicalByBucket.set(bucketKey, typicalValue)
  }

  const fallback = computeMode(allDailyAggregates, roundingDecimals)
    ?? computeMedian(allDailyAggregates)
    ?? computeMode(numericReferenceValues, roundingDecimals)
    ?? computeMedian(numericReferenceValues)

  const sortedEntries = Array.from(typicalByBucket.entries())
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => a[0] - b[0])

  const sortedKeys = sortedEntries.map(([key]) => key)
  const sortedValues = sortedEntries.map(([, value]) => value)

  function interpolate(bucketKey) {
    if (!sortedKeys.length) {
      return Number.isFinite(fallback) ? fallback : null
    }

    if (!Number.isFinite(bucketKey)) {
      return Number.isFinite(fallback) ? fallback : null
    }

    if (sortedKeys.length === 1) {
      return sortedValues[0]
    }

    if (bucketKey <= sortedKeys[0]) {
      return sortedValues[0]
    }

    const lastIndex = sortedKeys.length - 1
    if (bucketKey >= sortedKeys[lastIndex]) {
      return sortedValues[lastIndex]
    }

    let low = 0
    let high = lastIndex

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const midKey = sortedKeys[mid]

      if (midKey === bucketKey) {
        return sortedValues[mid]
      }

      if (midKey < bucketKey) {
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
      return Number.isFinite(fallback) ? fallback : null
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

    const ratio = (bucketKey - lowerKey) / span
    return lowerValue + (upperValue - lowerValue) * ratio
  }

  return targetTimestamps
    .map((rawTimestamp) => {
      const time = dayjs(rawTimestamp)
      const numericTime = time.isValid() ? time.valueOf() : Number(rawTimestamp)

      if (!Number.isFinite(numericTime)) {
        return null
      }

      const bucketKey = getBucketKey(numericTime, bucketSizeMs)
      const baselineValue = interpolate(bucketKey)

      return [numericTime, Number.isFinite(baselineValue) ? baselineValue : null]
    })
    .filter((entry) => Array.isArray(entry) && Number.isFinite(entry[0]))
}

export default buildDailyMedianBaseline
