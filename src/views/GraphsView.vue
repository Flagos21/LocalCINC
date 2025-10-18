<template>
  <section class="graphs">
    <header class="graphs__header">
      <div class="graphs__intro">
        <h2>Evolución magnética</h2>
        <p>Serie temporal de la componente {{ componentLabel }} registrada por la estación CHI.</p>
      </div>
      <form class="graphs__controls" @submit.prevent>
        <label class="control control--range">
          <span>Rango de fechas</span>
          <DateRangePicker v-model="dateRange" :max="today" />
        </label>
        <label class="control control--component">
          <span>Componente</span>
          <select v-model="component">
            <option value="H">H</option>
            <option value="deltaH">ΔH</option>
          </select>
        </label>
        <div class="control control--status" role="status">
          <span>Rango visible</span>
          <strong>{{ visibleRangeLabel }}</strong>
        </div>
        <button
          type="button"
          class="control control--reset"
          :disabled="isResetDisabled"
          @click="onResetZoom"
        >
          Restablecer vista
        </button>
      </form>
    </header>

    <section class="graphs__body" aria-live="polite">
      <div v-if="!hasValidRange" class="state">
        <p>Selecciona un rango de fechas válido para visualizar la serie.</p>
      </div>
      <div v-else-if="errorMessage" class="state state--error">
        <strong>Hubo un problema al cargar los datos.</strong>
        <p>{{ errorMessage }}</p>
      </div>
      <div v-else-if="isLoading" class="state state--loading">
        <span class="loader" aria-hidden="true" />
        <p>Cargando datos…</p>
      </div>
      <div v-else-if="!hasData" class="state">
        <p>No hay datos disponibles para este periodo.</p>
      </div>
      <MagnetometerD3Chart
        v-else
        ref="chartRef"
        class="graphs__chart"
        :points="chartPoints"
        unit="nT"
        :y-label="chartYLabel"
        x-label="Tiempo"
        :tooltip-formatter="tooltipFormatter"
        @update:visible-domain="onVisibleDomainUpdate"
      />
    </section>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import DateRangePicker from '@/components/DateRangePicker.vue';
import MagnetometerD3Chart from '@/components/MagnetometerD3Chart.vue';
import { useMagnetometerSeries } from '@/composables/useMagnetometerSeries';

const toInputDate = (date) => date.toISOString().slice(0, 10);

const todayDate = new Date();
const defaultEnd = toInputDate(todayDate);
const defaultStartDate = new Date(todayDate);
defaultStartDate.setDate(defaultStartDate.getDate() - 7);
const defaultStart = toInputDate(defaultStartDate);

const dateRange = ref({ start: defaultStart, end: defaultEnd });
const today = toInputDate(todayDate);

const chartRef = ref();
const visibleDomain = ref({ start: null, end: null });
const component = ref('H');

const toStartOfDayISO = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const toEndOfDayISO = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const fromISO = computed(() => toStartOfDayISO(dateRange.value.start));
const toISO = computed(() => toEndOfDayISO(dateRange.value.end));

const hasValidRange = computed(() => {
  if (!fromISO.value || !toISO.value) return false;
  const start = new Date(fromISO.value);
  const end = new Date(toISO.value);
  return start.getTime() < end.getTime();
});

const normalizedFrom = computed(() => (hasValidRange.value ? fromISO.value : ''));
const normalizedTo = computed(() => (hasValidRange.value ? toISO.value : ''));

const aggregation = computed(() => {
  if (!hasValidRange.value) return '1h';
  const diffMs = new Date(normalizedTo.value).getTime() - new Date(normalizedFrom.value).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 1) return '1m';
  if (diffDays <= 3) return '5m';
  if (diffDays <= 7) return '15m';
  if (diffDays <= 31) return '30m';
  if (diffDays <= 90) return '1h';
  if (diffDays <= 180) return '2h';
  if (diffDays <= 365) return '6h';
  return '12h';
});

const { labels, series, isLoading, errorMessage } = useMagnetometerSeries({
  station: 'CHI',
  unit: 'nT',
  every: aggregation,
  from: normalizedFrom,
  to: normalizedTo,
  range: '24h'
});

const rawPoints = computed(() => {
  const length = Math.min(labels.value.length, series.value.length);
  if (!length) return [];

  const result = [];
  for (let index = 0; index < length; index += 1) {
    const time = new Date(labels.value[index]);
    const value = Number(series.value[index]);
    if (!Number.isNaN(time.getTime()) && Number.isFinite(value)) {
      result.push({ date: time, value });
    }
  }
});

  return result;
});

const hasData = computed(() => rawPoints.value.length > 0);

const componentLabel = computed(() => (component.value === 'deltaH' ? 'ΔH' : 'H'));

const deltaBaseline = computed(() => {
  if (component.value !== 'deltaH') return 0;
  const data = rawPoints.value;
  if (!data.length) return 0;
  const total = data.reduce((acc, point) => acc + point.value, 0);
  return total / data.length;
});

const chartPoints = computed(() => {
  const data = rawPoints.value;
  if (!data.length) return [];

  if (component.value === 'deltaH') {
    const baseline = deltaBaseline.value;
    return data.map((point) => ({
      date: point.date,
      value: point.value - baseline,
      rawValue: point.value,
      baseline
    }));
  }

  return data.map((point) => ({ ...point, rawValue: point.value }));
});

const chartYLabel = computed(() => `${componentLabel.value} (nT)`);

const tooltipFormatter = (point, { formatValue }) => {
  if (!point) return '';
  const timeFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const formattedDate = timeFormatter.format(point.date);

  if (component.value === 'deltaH') {
    return `
      <strong>${formattedDate}</strong>
      <div>ΔH: ${formatValue(point.value)}</div>
      <div>H: ${formatValue(point.rawValue)}</div>
    `.trim();
  }

  return `
    <strong>${formattedDate}</strong>
    <div>H: ${formatValue(point.value)}</div>
  `.trim();
};

const rangeFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const visibleRangeLabel = computed(() => {
  const { start, end } = visibleDomain.value;
  if (!start || !end) return '—';

  try {
    return `${rangeFormatter.format(start)} — ${rangeFormatter.format(end)}`;
  } catch {
    return '—';
  }
});

const fullDomain = computed(() => {
  if (!hasData.value) return null;
  return {
    start: rawPoints.value[0].date,
    end: rawPoints.value[rawPoints.value.length - 1].date
  };
});

watch(rawPoints, (newPoints) => {
  if (!newPoints.length) {
    visibleDomain.value = { start: null, end: null };
    return;
  }

  visibleDomain.value = {
    start: newPoints[0].date,
    end: newPoints[newPoints.length - 1].date
  };
});

const onVisibleDomainUpdate = (domain) => {
  if (!Array.isArray(domain) || domain.length !== 2) return;
  const [start, end] = domain;
  if (!(start instanceof Date) || !(end instanceof Date)) return;
  visibleDomain.value = { start, end };
};

const onResetZoom = () => {
  chartRef.value?.resetZoom();
};

const isResetDisabled = computed(() => {
  if (!hasData.value) return true;
  const domain = fullDomain.value;
  const { start, end } = visibleDomain.value;
  if (!domain || !start || !end) return true;

  return (
    domain.start.getTime() === start.getTime() &&
    domain.end.getTime() === end.getTime()
  );
});
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
  gap: 1.5rem;
  align-items: flex-end;
}

.graphs__intro {
  max-width: min(36rem, 100%);
}

.graphs__header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2933;
  margin-bottom: 0.35rem;
}

.graphs__header p {
  color: #52606d;
}

.graphs__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
}

.control {
  display: flex;
  flex-direction: column;
  font-size: 0.875rem;
  color: #52606d;
  gap: 0.35rem;
}

.control--range {
  min-width: 16rem;
}

.control--status {
  font-size: 0.85rem;
  color: #4b5563;
}

.control--component select {
  min-width: 8rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #f8fafc;
  color: #1f2933;
  font-size: 0.9rem;
  font-weight: 500;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.control--component select:focus-visible {
  outline: none;
  border-color: rgba(37, 99, 235, 0.8);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.control--status strong {
  font-size: 0.95rem;
  color: #1f2933;
  font-weight: 600;
}

.control--reset {
  align-self: flex-start;
  padding: 0.65rem 1.1rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(37, 99, 235, 0.2);
  background: #2563eb;
  color: #ffffff;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.control--reset:disabled {
  background: rgba(148, 163, 184, 0.35);
  border-color: transparent;
  color: #e2e8f0;
  cursor: not-allowed;
}

.control--reset:not(:disabled):hover,
.control--reset:not(:disabled):focus-visible {
  background: #1d4ed8;
  transform: translateY(-1px);
  outline: none;
}

.graphs__body {
  min-height: 24rem;
}

.graphs__chart {
  width: 100%;
  min-height: 24rem;
}

.state {
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.65rem;
  color: #52606d;
  padding: 2.5rem 1.5rem;
  border: 1px dashed #d3dae6;
  border-radius: 0.75rem;
}

.state--error {
  border-color: rgba(244, 63, 94, 0.35);
  background: rgba(244, 63, 94, 0.08);
  color: #b91c1c;
}

.state--loading {
  color: #1f2933;
}

.loader {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 3px solid rgba(37, 99, 235, 0.25);
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
</style>
