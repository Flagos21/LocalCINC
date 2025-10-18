<script setup>
import { computed } from 'vue';

const props = defineProps({
  baseUrl: {
    type: String,
    default: ''
  },
  dashboardUid: {
    type: String,
    default: ''
  },
  dashboardSlug: {
    type: String,
    default: ''
  },
  panelId: {
    type: [String, Number],
    default: ''
  },
  orgId: {
    type: [String, Number],
    default: 1
  },
  from: {
    type: [Number, String, Date],
    default: null
  },
  to: {
    type: [Number, String, Date],
    default: null
  },
  theme: {
    type: String,
    default: 'light'
  },
  refresh: {
    type: String,
    default: ''
  },
  panelTitle: {
    type: String,
    default: ''
  }
});

const normalizeTimestamp = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : Math.floor(timestamp);
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return Math.floor(numeric);
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : Math.floor(parsed);
};

const fromTimestamp = computed(() => normalizeTimestamp(props.from));
const toTimestamp = computed(() => normalizeTimestamp(props.to));

const cleanedBaseUrl = computed(() => (props.baseUrl || '').replace(/\/+$/, ''));

const src = computed(() => {
  if (!cleanedBaseUrl.value || !props.dashboardUid || !props.panelId) {
    return '';
  }

  if (!props.dashboardSlug) {
    return '';
  }

  if (fromTimestamp.value === null || toTimestamp.value === null) {
    return '';
  }

  const base = `${cleanedBaseUrl.value}/d-solo/${encodeURIComponent(props.dashboardUid)}/${encodeURIComponent(props.dashboardSlug)}`;
  const url = new URL(base);
  url.searchParams.set('orgId', props.orgId);
  url.searchParams.set('from', fromTimestamp.value);
  url.searchParams.set('to', toTimestamp.value);
  url.searchParams.set('viewPanel', props.panelId);

  if (props.theme) {
    url.searchParams.set('theme', props.theme);
  }

  if (props.refresh) {
    url.searchParams.set('refresh', props.refresh);
  }

  if (props.panelTitle) {
    url.searchParams.set('panelTitle', props.panelTitle);
  }

  return url.toString();
});

const hasSrc = computed(() => Boolean(src.value));
</script>

<template>
  <div class="grafana-panel">
    <iframe
      v-if="hasSrc"
      :key="src"
      class="grafana-panel__iframe"
      :src="src"
      frameborder="0"
      allowfullscreen
      title="Visualización de Grafana"
    />
    <div v-else class="grafana-panel__state">
      <p>No fue posible construir la visualización de Grafana. Revisa la configuración.</p>
    </div>
  </div>
</template>

<style scoped>
.grafana-panel {
  width: 100%;
  height: 100%;
  min-height: 20rem;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: #f8fafc;
  display: flex;
}

.grafana-panel__iframe {
  width: 100%;
  height: 100%;
  border: 0;
}

.grafana-panel__state {
  margin: auto;
  padding: 2rem 1.5rem;
  text-align: center;
  color: #52606d;
}
</style>
