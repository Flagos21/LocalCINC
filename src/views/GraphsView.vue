<template>
  <section class="graphs">
    <header class="graphs__header">
      <div>
        <h2>Evolución magnética</h2>
        <p>Serie temporal de la componente H registrada por la estación CHI.</p>
      </div>
      <form class="graphs__controls" @submit.prevent>
        <label class="control control--range">
          <span>Rango de fechas</span>
          <DateRangePicker v-model="dateRange" :max="today" />
        </label>
      </form>
    </header>

    <section class="graphs__body" aria-live="polite">
      <div v-if="!hasGrafanaConfig" class="state state--warning">
        <strong>Configura Grafana para continuar.</strong>
        <p>
          Asegúrate de definir las variables de entorno
          <code>VITE_GRAFANA_BASE_URL</code>, <code>VITE_GRAFANA_DASHBOARD_UID</code>,
          <code>VITE_GRAFANA_DASHBOARD_SLUG</code> y <code>VITE_GRAFANA_PANEL_ID</code>.
        </p>
      </div>
      <div v-else-if="!hasValidRange" class="state">
        <p>Selecciona un rango de fechas válido para visualizar la serie.</p>
      </div>
      <GrafanaPanel
        v-else
        :key="grafanaKey"
        class="graphs__grafana"
        :base-url="grafanaConfig.baseUrl"
        :dashboard-uid="grafanaConfig.dashboardUid"
        :dashboard-slug="grafanaConfig.dashboardSlug"
        :panel-id="grafanaConfig.panelId"
        :org-id="grafanaConfig.orgId"
        :from="fromTimestamp"
        :to="toTimestamp"
        :theme="grafanaConfig.theme"
        :refresh="grafanaConfig.refresh"
        panel-title="Componente H"
      />
    </section>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import DateRangePicker from '@/components/DateRangePicker.vue';
import GrafanaPanel from '@/components/GrafanaPanel.vue';

const toInputDate = (date) => date.toISOString().slice(0, 10);

const todayDate = new Date();
const defaultEnd = toInputDate(todayDate);
const defaultStartDate = new Date(todayDate);
defaultStartDate.setDate(defaultStartDate.getDate() - 7);
const defaultStart = toInputDate(defaultStartDate);

const dateRange = ref({ start: defaultStart, end: defaultEnd });
const today = toInputDate(todayDate);

const grafanaConfig = {
  baseUrl: import.meta.env.VITE_GRAFANA_BASE_URL ?? '',
  dashboardUid: import.meta.env.VITE_GRAFANA_DASHBOARD_UID ?? '',
  dashboardSlug: import.meta.env.VITE_GRAFANA_DASHBOARD_SLUG ?? '',
  panelId: import.meta.env.VITE_GRAFANA_PANEL_ID ?? '',
  orgId: import.meta.env.VITE_GRAFANA_ORG_ID ?? '1',
  theme: import.meta.env.VITE_GRAFANA_THEME ?? 'light',
  refresh: import.meta.env.VITE_GRAFANA_REFRESH ?? ''
};

const hasGrafanaConfig = computed(
  () =>
    Boolean(
      grafanaConfig.baseUrl &&
        grafanaConfig.dashboardUid &&
        grafanaConfig.dashboardSlug &&
        grafanaConfig.panelId
    )
);

const toStartOfDay = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toEndOfDay = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const fromTimestamp = computed(() => {
  const start = toStartOfDay(dateRange.value.start);
  return start ? start.getTime() : null;
});

const toTimestamp = computed(() => {
  const end = toEndOfDay(dateRange.value.end);
  return end ? end.getTime() : null;
});

const hasValidRange = computed(() => {
  if (fromTimestamp.value === null || toTimestamp.value === null) {
    return false;
  }

  return fromTimestamp.value < toTimestamp.value;
});

const grafanaKey = computed(() => `${fromTimestamp.value}-${toTimestamp.value}`);
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

.control--range {
  min-width: 16rem;
}

.graphs__body {
  min-height: 20rem;
}

.graphs__grafana {
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

.state--warning {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.08);
  color: #b45309;
}

.state code {
  background: rgba(15, 23, 42, 0.06);
  padding: 0.1rem 0.3rem;
  border-radius: 0.35rem;
  font-size: 0.85rem;
}
</style>
