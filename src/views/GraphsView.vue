<template>
  <section class="graphs">
    <header class="graphs__header">
      <div>
        <h2>Evolución magnética</h2>
        <p>Serie temporal de la componente H registrada por la estación CHI.</p>
      </div>
      <form class="graphs__controls" @submit.prevent>
        <label class="control">
          <span>Rango</span>
          <select v-model="range">
            <option v-for="option in rangeOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
        <label class="control">
          <span>Resolución</span>
          <select v-model="every">
            <option v-for="option in everyOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
        <label class="control">
          <span>Unidad</span>
          <select v-model="unit">
            <option v-for="option in unitOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
      </form>
    </header>

    <section class="graphs__body" aria-live="polite">
      <div v-if="errorMessage" class="state state--error">
        <strong>Hubo un problema al cargar los datos.</strong>
        <p>{{ errorMessage }}</p>
      </div>
      <div v-else-if="isLoading" class="state state--loading">
        <span class="loader" aria-hidden="true" />
        <p>Cargando datos…</p>
      </div>
      <div v-else-if="!hasData" class="state">
        <p>No hay datos disponibles para los filtros seleccionados.</p>
      </div>
      <figure v-else class="chart-wrapper">
        <svg
          class="chart"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
          role="img"
          aria-labelledby="chart-title"
        >
          <title id="chart-title">Serie temporal de la componente H</title>
          <g class="axes">
            <line :x1="padding" :y1="padding" :x2="padding" :y2="chartHeight - padding" />
            <line
              :x1="padding"
              :y1="chartHeight - padding"
              :x2="chartWidth - padding"
              :y2="chartHeight - padding"
            />
            <text
              class="axis-label axis-label--y"
              :x="padding / 2"
              :y="padding - 12"
            >
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
              <text class="tick-label" :x="tick.x" :y="chartHeight - padding + 24">
                {{ tick.label }}
              </text>
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
    </section>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const rangeToEveryOptions = {
  '6h': ['1m', '5m'],
  '12h': ['2m', '5m', '10m'],
  '24h': ['1m', '5m', '15m'],
  '48h': ['5m', '15m', '30m'],
  '7d': ['15m', '30m', '1h']
};

const unitOptions = ['nT', 'pT'];

const range = ref('24h');
const every = ref('1m');
const unit = ref('nT');

const labels = ref([]);
const seriesData = ref([]);
const isLoading = ref(false);
const errorMessage = ref('');

const abortController = ref();

const rangeOptions = Object.keys(rangeToEveryOptions);

const everyOptions = computed(() => rangeToEveryOptions[range.value] || ['1m']);

watch(range, (value) => {
  if (!everyOptions.value.includes(every.value)) {
    every.value = everyOptions.value[0];
  }
});

const fetchData = async () => {
  if (abortController.value) {
    abortController.value.abort();
  }

  const controller = new AbortController();
  abortController.value = controller;
  isLoading.value = true;
  errorMessage.value = '';

  const searchParams = new URLSearchParams({
    station: 'CHI',
    range: range.value,
    every: every.value,
    unit: unit.value
  });

  try {
    const response = await fetch(`/api/series?${searchParams.toString()}`, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error('No se pudieron obtener los datos del servicio.');
    }

    const rawBody = await response.text();
    const contentType = response.headers.get('content-type') || '';
    let payload;

    try {
      if (contentType.includes('application/json') || contentType.includes('+json')) {
        payload = JSON.parse(rawBody);
      } else {
        throw new Error();
      }
    } catch (error) {
      const snippet = rawBody.slice(0, 140).replace(/\s+/g, ' ').trim();
      throw new Error(
        snippet
          ? `La respuesta no es JSON válido. Detalle: "${snippet}${rawBody.length > 140 ? '…' : ''}"`
          : 'La respuesta no es JSON válido.'
      );
    }

    const incomingLabels = Array.isArray(payload.labels) ? payload.labels : [];
    const incomingSeries = Array.isArray(payload.series?.[0]?.data)
      ? payload.series[0].data.map((value) => Number.parseFloat(value))
      : [];

    const length = Math.min(incomingLabels.length, incomingSeries.length);
    labels.value = incomingLabels.slice(0, length);
    seriesData.value = incomingSeries.slice(0, length);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }

    const message = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
    errorMessage.value = message;
    labels.value = [];
    seriesData.value = [];
  } finally {
    if (abortController.value === controller) {
      abortController.value = undefined;
    }
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchData();
});

watch([range, every, unit], () => {
  fetchData();
});

onBeforeUnmount(() => {
  if (abortController.value) {
    abortController.value.abort();
  }
});

const hasData = computed(() => labels.value.length > 0 && seriesData.value.length > 0);

const chartWidth = 900;
const chartHeight = 360;
const padding = 56;
const chartInnerWidth = computed(() => chartWidth - padding * 2);
const chartInnerHeight = computed(() => chartHeight - padding * 2);

const minValue = computed(() => {
  if (!seriesData.value.length) return 0;
  return Math.min(...seriesData.value);
});

const maxValue = computed(() => {
  if (!seriesData.value.length) return 0;
  return Math.max(...seriesData.value);
});

const rawRange = computed(() => maxValue.value - minValue.value);

const chartPadding = computed(() => {
  if (!seriesData.value.length) return 1;
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

const safeLength = computed(() => Math.max(labels.value.length - 1, 1));

const chartPoints = computed(() => {
  if (!hasData.value) return '';
  const stepX = chartInnerWidth.value / safeLength.value;

  return seriesData.value
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
  const total = labels.value.length;
  const step = Math.max(1, Math.floor(total / maxTicks));

  return labels.value.reduce((acc, current, index) => {
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
  if (!labels.value.length) return '—';
  const latest = labels.value[labels.value.length - 1];
  return formatLabel(latest);
});

const formattedMaxValue = computed(() => (hasData.value ? formatValue(maxValue.value) : '—'));
const formattedMinValue = computed(() => (hasData.value ? formatValue(minValue.value) : '—'));
</script>

<style scoped>
.graphs {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 2rem;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.graphs__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1.25rem;
}

.graphs__header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2933;
  margin-bottom: 0.25rem;
}

.graphs__header p {
  color: #52606d;
  max-width: 32rem;
}

.graphs__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.control {
  display: flex;
  flex-direction: column;
  font-size: 0.875rem;
  color: #52606d;
  gap: 0.35rem;
}

.control select {
  min-width: 7rem;
  border-radius: 0.5rem;
  border: 1px solid #d3dae6;
  padding: 0.45rem 0.75rem;
  font-size: 0.95rem;
  color: #1f2933;
  background: #f8fafc;
}

.graphs__body {
  min-height: 20rem;
}

.state {
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.5rem;
  color: #52606d;
  padding: 3rem 1rem;
  border: 1px dashed #d3dae6;
  border-radius: 0.75rem;
}

.state--error {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.35);
  background: rgba(180, 35, 24, 0.06);
}

.state--loading {
  color: #1f2933;
}

.loader {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 3px solid rgba(37, 99, 235, 0.2);
  border-top-color: #2563eb;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

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
  stroke: #475569;
  stroke-width: 1.5;
  stroke-dasharray: 6 6;
  opacity: 0.4;
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

@media (max-width: 768px) {
  .graphs {
    padding: 1.5rem;
  }

  .control select {
    min-width: 6rem;
  }
}
</style>
