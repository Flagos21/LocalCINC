const UNIT_TO_MS = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
}

export function durationStringToMs(input) {
  if (typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i)
  if (!match) {
    return null
  }

  const value = Number(match[1])
  const unit = match[2].toLowerCase()

  if (!Number.isFinite(value) || !(unit in UNIT_TO_MS)) {
    return null
  }

  return value * UNIT_TO_MS[unit]
}

export function injectNullGaps(points, stepMs, gapMultiplier = 2) {
  if (!Array.isArray(points) || !Number.isFinite(stepMs) || stepMs <= 0) {
    return Array.isArray(points) ? points.slice() : []
  }

  const threshold = stepMs * gapMultiplier
  const result = []

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    result.push(current)

    if (!next) {
      continue
    }

    const currentTs = Array.isArray(current) ? current[0] : Number(current?.x)
    const nextTs = Array.isArray(next) ? next[0] : Number(next?.x)

    if (!Number.isFinite(currentTs) || !Number.isFinite(nextTs)) {
      continue
    }

    const gap = nextTs - currentTs
    if (gap > threshold) {
      const nullTimestamp = currentTs + stepMs
      if (nullTimestamp < nextTs) {
        result.push([nullTimestamp, null])
      }
    }
  }

  return result
}
