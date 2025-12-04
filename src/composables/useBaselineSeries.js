import { computed, isRef, ref, unref } from 'vue'

import { buildDailyMedianBaseline } from '@/utils/baseline'
import { durationStringToMs } from '@/utils/timeSeriesGaps'
import { useMagnetometerSeries } from './useMagnetometerSeries'

function toRefOrRef(value, fallback = '') {
  return isRef(value) ? value : ref(value ?? fallback)
}

export function useBaselineSeries({
  station = '',
  every = '',
  endpoint = '/api/series',
  unit = '',
  targetTimestamps = [],
  bucketSizeMs,
  roundingDecimals
} = {}) {
  const stationRef = toRefOrRef(station)
  const everyRef = toRefOrRef(every)
  const endpointRef = toRefOrRef(endpoint)
  const unitRef = toRefOrRef(unit)
  const targetRef = computed(() => (isRef(targetTimestamps) ? targetTimestamps.value : targetTimestamps) || [])
  const explicitBucketSizeRef = isRef(bucketSizeMs) ? bucketSizeMs : ref(bucketSizeMs)

  const { labels, series, isLoading, errorMessage } = useMagnetometerSeries({
    range: ref('7d'),
    every: everyRef,
    unit: unitRef,
    station: stationRef,
    from: ref(''),
    to: ref(''),
    endpoint: endpointRef
  })

  const bucketSize = computed(() => {
    const explicit = unref(explicitBucketSizeRef)
    if (Number.isFinite(explicit) && explicit > 0) {
      return explicit
    }

    const parsed = durationStringToMs(unref(everyRef))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  })

  const baselineSeries = computed(() => buildDailyMedianBaseline({
    referenceTimestamps: labels.value,
    referenceValues: series.value,
    targetTimestamps: targetRef.value,
    bucketSizeMs: bucketSize.value,
    roundingDecimals
  }))

  return {
    baselineSeries,
    baselineError: errorMessage,
    isBaselineLoading: isLoading
  }
}
