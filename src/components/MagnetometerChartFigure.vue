<script setup>
import { computed } from 'vue';

const props = defineProps({
  labels: {
    type: Array,
    default: () => []
  },
  series: {
    type: Array,
    default: () => []
  },
  unit: {
    type: String,
    default: 'nT'
  }
});

const chartWidth = 900;
const chartHeight = 360;
const padding = 56;

const hasData = computed(() => props.labels.length > 0 && props.series.length > 0);

const chartInnerWidth = computed(() => chartWidth - padding * 2);
const chartInnerHeight = computed(() => chartHeight - padding * 2);

const minValue = computed(() => {
  if (!props.series.length) return 0;
  return Math.min(...props.series);
});

const maxValue = computed(() => {
  if (!props.series.length) return 0;
  return Math.max(...props.series);
});

const rawRange = computed(() => maxValue.value - minValue.value);

const chartPadding = computed(() => {
  if (!props.series.length) return 1;
  const diff = rawRange.value;
  if (diff === 0) {
    const magnitude = Math.max(Math.abs(maxValue.value), 1);
    return magnitude * 0.1;
  }
  return diff * 0.1;
});

const domainMin = computed(() => minValue.value - chartPadding.value);
const domainMax = computed(() => maxValue.value + chartPadding.value);

const domainRange = computed(() => {
  const diff = domainMax.value - domainMin.value;
  return diff === 0 ? 1 : diff;
});

const numberFormatter = new Intl.NumberFormat('es-CL', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
});

const formatValue = (value) => numberFormatter.format(value);

const safeLength = computed(() => Math.max(props.labels.length - 1, 1));

const chartPoints = computed(() => {
  if (!hasData.value) return '';
  const stepX = chartInnerWidth.value / safeLength.value;

  return props.series
    .map((value, index) => {
      const x = padding + stepX * index;
      const normalized = (value - domainMin.value) / domainRange.value;
      const y = chartHeight - padding - normalized * chartInnerHeight.value;
      return `${x},${y}`;
    })
    .join(' ');
});

const areaPoints = computed(() => {
  if (!chartPoints.value) return '';
  const points = chartPoints.value.split(' ');
  const baseLeft = `${padding},${chartHeight - padding}`;
  const baseRight = `${padding + chartInnerWidth.value},${chartHeight - padding}`;
  return `${baseLeft} ${points.join(' ')} ${baseRight}`;
});

const zeroLineY = computed(() => {
  if (!hasData.value) return null;
  if (minValue.value > 0 || maxValue.value < 0) return null;

  const normalized = (0 - domainMin.value) / domainRange.value;
  return chartHeight - padding - normalized * chartInnerHeight.value;
});

const yTicks = computed(() => {
  if (!hasData.value) return [];
  const divisions = 4;
  const step = domainRange.value / divisions;
  return Array.from({ length: divisions + 1 }, (_, index) => {
    const value = domainMin.value + step * index;
    const normalized = (value - domainMin.value) / domainRange.value;
    const y = chartHeight - padding - normalized * chartInnerHeight.value;
    return {
      y,
      label: formatValue(value)
    };
  });
});

const formatLabel = (value) => {
  try {
    return new Intl.DateTimeFormat('es-CL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
};

const xTicks = computed(() => {
  if (!hasData.value) return [];
  const maxTicks = 6;
  const total = props.labels.length;
  const step = Math.max(1, Math.floor(total / maxTicks));

  return props.labels.reduce((acc, current, index) => {
    if (index % step === 0 || index === total - 1) {
      const position = chartInnerWidth.value * (index / safeLength.value);
      acc.push({
        index,
        x: padding + position,
        label: formatLabel(current)
      });
    }
    return acc;
  }, []);
});

const lastLabel = computed(() => {
  if (!props.labels.length) return '—';
  const latest = props.labels[props.labels.length - 1];
  return formatLabel(latest);
});

const formattedMaxValue = computed(() => (hasData.value ? formatValue(maxValue.value) : '—'));
const formattedMinValue = computed(() => (hasData.value ? formatValue(minValue.value) : '—'));
</script>

<template>
  <figure class="chart-wrapper">
    <svg
      class="chart"
      :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
      role="img"
      aria-labelledby="chart-title"
    >
      <title id="chart-title">Serie temporal de la componente H</title>
      <g class="axes">
        <line :x1="padding" :y1="padding" :x2="padding" :y2="chartHeight - padding" />
        <line :x1="padding" :y1="chartHeight - padding" :x2="chartWidth - padding" :y2="chartHeight - padding" />
        <text class="axis-label axis-label--y" :x="padding / 2" :y="padding - 12">
          H ({{ unit }})
        </text>
      </g>

      <g class="ticks y-ticks">
        <template v-for="tick in yTicks" :key="`y-${tick.label}`">
          <line :x1="padding" :x2="chartWidth - padding" :y1="tick.y" :y2="tick.y" />
          <text class="tick-label" :x="padding - 12" :y="tick.y + 4">{{ tick.label }}</text>
        </template>
      </g>

      <g class="ticks x-ticks">
        <template v-for="tick in xTicks" :key="`x-${tick.index}`">
          <line :x1="tick.x" :x2="tick.x" :y1="chartHeight - padding" :y2="chartHeight - padding + 8" />
          <text class="tick-label" :x="tick.x" :y="chartHeight - padding + 24">{{ tick.label }}</text>
        </template>
      </g>

      <line
        v-if="zeroLineY !== null"
        class="zero-line"
        :x1="padding"
        :x2="chartWidth - padding"
        :y1="zeroLineY"
        :y2="zeroLineY"
      />

      <polyline class="line" :points="chartPoints" />
      <polygon class="area" :points="areaPoints" />
    </svg>
    <figcaption class="chart-meta">
      <div>
        <span>Máximo</span>
        <strong>{{ formattedMaxValue }} {{ unit }}</strong>
      </div>
      <div>
        <span>Mínimo</span>
        <strong>{{ formattedMinValue }} {{ unit }}</strong>
      </div>
      <div>
        <span>Última lectura</span>
        <strong>{{ lastLabel }}</strong>
      </div>
    </figcaption>
  </figure>
</template>

<style scoped>
.chart-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.chart {
  width: 100%;
  max-width: 100%;
  height: auto;
  overflow: visible;
}

.axes line {
  stroke: #cbd5f5;
  stroke-width: 1;
}

.axis-label {
  fill: #1f2933;
  font-size: 0.9rem;
  font-weight: 600;
}

.axis-label--y {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

.ticks line {
  stroke: rgba(148, 163, 184, 0.4);
  stroke-width: 1;
}

.tick-label {
  fill: #475569;
  font-size: 0.75rem;
  text-anchor: middle;
}

.y-ticks .tick-label {
  text-anchor: end;
}

.line {
  fill: none;
  stroke: #2563eb;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.area {
  fill: rgba(37, 99, 235, 0.12);
}

.zero-line {
  stroke: rgba(107, 114, 128, 0.6);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
}

.chart-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  color: #52606d;
}

.chart-meta span {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
}

.chart-meta strong {
  display: block;
  font-size: 1.05rem;
  color: #1f2933;
  margin-top: 0.25rem;
}
</style>
