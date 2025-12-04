<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import dayjs from '@/utils/dayjs'

const today = dayjs().format('YYYY-MM-DD')
const selectedDate = ref(today)
const images = ref([])
const currentIndex = ref(0)
const isLoading = ref(false)
const errorMessage = ref('')

const MAX_VISIBLE_THUMBNAILS = 4

const currentImage = computed(() => images.value[currentIndex.value] ?? null)
const hasPrevious = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < images.value.length - 1)

const formattedSelectedDate = computed(() => dayjs(selectedDate.value).format('DD MMM YYYY'))
const formattedTime = computed(() => {
  if (!currentImage.value) return ''
  if (currentImage.value.timestamp) {
    return dayjs.utc(currentImage.value.timestamp).format('HH:mm:ss [UTC]')
  }
  return currentImage.value.displayTime || ''
})

const thumbnailWindowStart = computed(() => {
  const halfWindow = Math.floor(MAX_VISIBLE_THUMBNAILS / 2)
  const maxStart = Math.max(images.value.length - MAX_VISIBLE_THUMBNAILS, 0)
  return Math.min(Math.max(currentIndex.value - halfWindow, 0), maxStart)
})

const visibleThumbnails = computed(() =>
  images.value.slice(thumbnailWindowStart.value, thumbnailWindowStart.value + MAX_VISIBLE_THUMBNAILS)
)

async function fetchImages(dateStr) {
  try {
    isLoading.value = true
    errorMessage.value = ''
    images.value = []
    currentIndex.value = 0

    const response = await fetch(`/api/ionograms/list?date=${dateStr}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const payload = await response.json()
    const list = Array.isArray(payload.images) ? payload.images : []

    const enhanced = list.map((image) => {
      const iso = image.timestamp
      const fallbackTime = iso ? dayjs.utc(iso).format('HH:mm:ss') : ''
      const displayTime = image.time || fallbackTime
      const sortKey = iso || `${dateStr}T${(displayTime || '').replace(/:/g, '')}_${image.filename || ''}`

      return {
        ...image,
        displayTime,
        sortKey,
      }
    })

    enhanced.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    images.value = enhanced
  } catch (err) {
    console.error('Error listando ionogramas:', err)
    errorMessage.value = 'No se pudieron cargar los ionogramas de la fecha indicada.'
  } finally {
    isLoading.value = false
  }
}

function goToIndex(index) {
  if (index < 0 || index >= images.value.length) return
  currentIndex.value = index
}

function goPrevious() {
  if (hasPrevious.value) {
    currentIndex.value -= 1
  }
}

function goNext() {
  if (hasNext.value) {
    currentIndex.value += 1
  }
}

function handleKey(event) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goPrevious()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    goNext()
  }
}

watch(selectedDate, (newDate) => {
  if (!newDate) return
  fetchImages(newDate)
})

onMounted(() => {
  fetchImages(selectedDate.value)
  window.addEventListener('keydown', handleKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <section class="gallery">
    <header class="gallery__header">
      <div>
        <h2>Galería de ionogramas</h2>
        <p>Selecciona una fecha para explorar los ionogramas disponibles.</p>
      </div>

      <label class="gallery__date-picker">
        <span>Fecha</span>
        <input type="date" v-model="selectedDate" :max="today" />
      </label>
    </header>

    <div class="gallery__card">
      <div class="gallery__content">
        <div class="gallery__viewer" :class="{ 'gallery__viewer--empty': !currentImage }">
          <div v-if="isLoading" class="gallery__status">Cargando ionogramas…</div>
          <div v-else-if="errorMessage" class="gallery__status gallery__status--error">{{ errorMessage }}</div>
          <template v-else>
            <div v-if="currentImage" class="gallery__canvas">
              <button class="gallery__nav gallery__nav--prev" type="button" @click="goPrevious" :disabled="!hasPrevious">
                ◀
              </button>
              <img :src="currentImage.url" class="gallery__image" :alt="`Ionograma ${formattedSelectedDate} ${formattedTime}`" />
              <button class="gallery__nav gallery__nav--next" type="button" @click="goNext" :disabled="!hasNext">
                ▶
              </button>
            </div>
            <p v-else class="gallery__status">No hay ionogramas para esta fecha.</p>
          </template>
        </div>

        <aside class="gallery__rail" v-if="images.length">
          <header class="gallery__rail-header">
            <div>
              <p class="gallery__rail-label">Ionogramas del día</p>
              <strong class="gallery__rail-date">{{ formattedSelectedDate }}</strong>
            </div>
            <span class="gallery__rail-count">{{ images.length }}</span>
          </header>

          <div class="gallery__rail-list" :style="{ '--rail-size': MAX_VISIBLE_THUMBNAILS }">
            <button
              v-for="(image, index) in visibleThumbnails"
              :key="image.url"
              class="gallery__thumb"
              type="button"
              :class="{ 'gallery__thumb--active': thumbnailWindowStart + index === currentIndex }"
              @click="goToIndex(thumbnailWindowStart + index)"
            >
              <img :src="image.url" :alt="`Ionograma ${image.displayTime || image.timestamp || 'sin hora'}`" />
              <span class="gallery__thumb-time">{{ image.displayTime || (image.timestamp ? dayjs.utc(image.timestamp).format('HH:mm') : '—') }}</span>
            </button>
          </div>
          <p class="gallery__rail-hint">Usa las flechas o selecciona una miniatura para avanzar.</p>
        </aside>
      </div>

      <footer class="gallery__footer">
        <div class="gallery__meta" v-if="currentImage">
          <strong>{{ formattedSelectedDate }}</strong>
          <span v-if="formattedTime">{{ formattedTime }}</span>
        </div>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  flex: 1;
  min-height: 0;
  width: min(100%, 74rem);
  margin: 0 auto;
}

.gallery__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
}

.gallery__header h2 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #0f172a;
}

.gallery__header p { color: #475569; }

.gallery__date-picker {
  display: inline-flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.95rem;
  color: #0f172a;
}

.gallery__date-picker input {
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  padding: 0.5rem 0.65rem;
  background: #f8fafc;
  min-width: 12rem;
  color: inherit;
}

.gallery__date-picker input:focus-visible {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.gallery__card {
  background: #ffffff;
  border-radius: 0.9rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.gallery__content {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
}

.gallery__viewer {
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 1.1rem;
  border: 1px solid #e2e8f0;
  min-height: 360px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  justify-content: center;
  flex: 1 1 420px;
}

.gallery__viewer--empty { background: #f8fafc; }

.gallery__status {
  color: #475569;
  font-size: 1rem;
  text-align: center;
}

.gallery__status--error { color: #b91c1c; }

.gallery__canvas {
  position: relative;
  width: 100%;
  max-width: 720px;
  aspect-ratio: 3 / 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.gallery__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.gallery__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid #cbd5e1;
  background: rgba(255, 255, 255, 0.95);
  color: #0f172a;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.gallery__nav:hover:not(:disabled),
.gallery__nav:focus-visible {
  background: #e2e8f0;
  border-color: #94a3b8;
  outline: none;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.25);
}

.gallery__nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.gallery__nav--prev { left: 1rem; }
.gallery__nav--next { right: 1rem; }

.gallery__rail {
  flex: 0 0 240px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.9rem;
  min-height: 360px;
}

.gallery__rail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.gallery__rail-label {
  font-size: 0.9rem;
  color: #475569;
  margin: 0;
}

.gallery__rail-date {
  display: block;
  color: #0f172a;
}

.gallery__rail-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: #e0e7ff;
  color: #3730a3;
  font-weight: 600;
}

.gallery__rail-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  max-height: calc(var(--rail-size, 4) * 5.75rem);
  overflow: hidden;
}

.gallery__rail-hint {
  font-size: 0.85rem;
  color: #475569;
  margin: 0;
}

@media (max-width: 900px) {
  .gallery__rail {
    flex: 1 1 100%;
    min-height: unset;
  }

  .gallery__rail-list {
    max-height: none;
  }
}


.gallery__footer {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.gallery__meta {
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 1rem;
  color: #0f172a;
}

.gallery__thumb {
  position: relative;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 0.4rem;
  border-radius: 0.65rem;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}

.gallery__thumb img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  border-radius: 0.45rem;
}

.gallery__thumb:hover,
.gallery__thumb:focus-visible {
  border-color: #94a3b8;
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.08);
  transform: translateY(-2px);
  outline: none;
}

.gallery__thumb--active {
  border-color: #2563eb;
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.12);
}

.gallery__thumb-time {
  position: absolute;
  inset: auto 0 0 0;
  background: rgba(15, 23, 42, 0.72);
  color: #f8fafc;
  font-size: 0.8rem;
  padding: 0.25rem 0.4rem;
  text-align: center;
}

.gallery__thumb--active .gallery__thumb-time {
  background: rgba(37, 99, 235, 0.85);
}
</style>
