<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import dayjs from '@/utils/dayjs'

const latestImage = ref(null)
const isLoading = ref(false)
const errorMessage = ref('')
let intervalId = null

const formattedTimestamp = computed(() => {
  if (!latestImage.value?.timestamp) return ''
  return dayjs.utc(latestImage.value.timestamp).format('DD MMM YYYY HH:mm:ss [UTC]')
})

async function loadLatest() {
  try {
    isLoading.value = true
    errorMessage.value = ''

    const response = await fetch('/api/ionograms/latest', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    latestImage.value = await response.json()
  } catch (err) {
    console.error('Error cargando último ionograma:', err)
    errorMessage.value = 'No se pudo obtener la imagen más reciente.'
  } finally {
    isLoading.value = false
  }
}

function startAutoRefresh() {
  stopAutoRefresh()
  intervalId = setInterval(loadLatest, 60_000)
}

function stopAutoRefresh() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

onMounted(async () => {
  await loadLatest()
  startAutoRefresh()
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})
</script>

<template>
  <article class="ionogram-card">
    <header class="ionogram-card__header">
      <div>
        <h3>Ionograma más reciente</h3>
        <p>Actualización automática cada 60 segundos.</p>
      </div>
      <div class="ionogram-card__tools">
        <button class="ionogram-card__refresh" type="button" @click="loadLatest" :disabled="isLoading">
          {{ isLoading ? 'Actualizando…' : 'Actualizar' }}
        </button>
        <slot name="aspect-control" />
      </div>
    </header>

    <div class="ionogram-card__body">
      <div v-if="isLoading" class="ionogram-card__status">Cargando imagen…</div>
      <div v-else-if="errorMessage" class="ionogram-card__status ionogram-card__status--error">
        {{ errorMessage }}
      </div>
      <img
        v-else-if="latestImage?.url"
        :src="latestImage.url"
        :alt="formattedTimestamp ? `Ionograma ${formattedTimestamp}` : 'Ionograma más reciente'"
        class="ionogram-card__image"
      />
      <div v-else class="ionogram-card__status">No hay ionogramas disponibles.</div>
    </div>

    <footer class="ionogram-card__footer" v-if="formattedTimestamp">
      <span class="ionogram-card__time">{{ formattedTimestamp }}</span>
    </footer>
  </article>
</template>

<style scoped>
.ionogram-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem 1rem;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  min-height: 0;
  height: 100%;
}

.ionogram-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.ionogram-card__tools {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.ionogram-card__tools :deep(.aspect-control) {
  flex-shrink: 0;
}

.ionogram-card__header h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #0f172a;     /* mismo color que los demás titulares */
}

.ionogram-card__header p {
  margin-top: 0.2rem;
  color: #69707d;
  font-size: 0.9rem;
}

.ionogram-card__refresh {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: #f9fafb;
  cursor: pointer;
  font-weight: 500;
  color: #1f2933;
}

.ionogram-card__refresh:hover:not(:disabled) {
  background: #f3f4f6;
}

.ionogram-card__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ionogram-card__body {
  position: relative;
  flex: 1 1 auto;
  border-radius: 0.75rem;
  background: #0b1020;
  display: grid;
  place-items: center;
  overflow: hidden;
  min-height: var(--ionogram-body-min-height, 18rem);
}

.ionogram-card__image {
  width: 100%;
  height: 100%;
  max-height: 100%;
  object-fit: contain;
}

.ionogram-card__status {
  color: #e5e7eb;
  text-align: center;
  padding: 1rem;
}

.ionogram-card__status--error {
  color: #fecaca;
}

.ionogram-card__footer {
  display: flex;
  justify-content: flex-end;
  font-size: 0.85rem;
  color: #52606d;
}
</style>
