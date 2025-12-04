<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import dayjs from '@/utils/dayjs'

const today = dayjs().format('YYYY-MM-DD')
const selectedDate = ref(today)
const images = ref([])
const currentIndex = ref(0)
const isLoading = ref(false)
const errorMessage = ref('')

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

    <div class="gallery__viewer" :class="{ 'gallery__viewer--empty': !currentImage }">
      <div v-if="isLoading" class="gallery__status">Cargando ionogramas…</div>
      <div v-else-if="errorMessage" class="gallery__status gallery__status--error">{{ errorMessage }}</div>
      <template v-else>
        <div v-if="currentImage" class="gallery__stage">
          <div class="gallery__canvas">
            <button class="gallery__nav gallery__nav--prev" type="button" @click="goPrevious" :disabled="!hasPrevious">
              ◀
            </button>
            <img :src="currentImage.url" class="gallery__image" :alt="`Ionograma ${formattedSelectedDate} ${formattedTime}`" />
            <button class="gallery__nav gallery__nav--next" type="button" @click="goNext" :disabled="!hasNext">
              ▶
            </button>
          </div>

          <aside class="gallery__thumbnails" v-if="images.length">
            <button
              v-for="(image, index) in images"
              :key="image.url"
              class="gallery__thumb"
              type="button"
              :class="{ 'gallery__thumb--active': index === currentIndex }"
              @click="goToIndex(index)"
            >
              <img :src="image.url" :alt="`Ionograma ${image.displayTime || image.timestamp || 'sin hora'}`" />
              <span class="gallery__thumb-time">{{ image.displayTime || (image.timestamp ? dayjs.utc(image.timestamp).format('HH:mm') : '—') }}</span>
            </button>
          </aside>
        </div>
        <p v-else class="gallery__status">No hay ionogramas para esta fecha.</p>
      </template>
    </div>

    <footer class="gallery__footer" v-if="currentImage">
      <div class="gallery__meta">
        <strong>{{ formattedSelectedDate }}</strong>
        <span v-if="formattedTime">{{ formattedTime }}</span>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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
  color: #1f2933;
}

.gallery__header p {
  color: #52606d;
}

.gallery__date-picker {
  display: inline-flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.95rem;
  color: #1f2933;
}

.gallery__date-picker input {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: #ffffff;
  min-width: 12rem;
}

.gallery__viewer {
  background: #ffffff;
  border-radius: 0.75rem;
  padding: 1rem;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  min-height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gallery__viewer--empty {
  background: #f9fafb;
}

.gallery__status {
  color: #4b5563;
  font-size: 1rem;
  text-align: center;
}

.gallery__status--error {
  color: #dc2626;
}

.gallery__stage {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  width: 100%;
  align-items: stretch;
}

.gallery__stage:has(.gallery__thumbnails) {
  align-items: start;
}

.gallery__canvas {
  position: relative;
  width: 100%;
  max-width: 720px;
  aspect-ratio: 3 / 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1020;
  border-radius: 0.75rem;
  overflow: hidden;
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
  border: none;
  background: rgba(15, 23, 42, 0.55);
  color: #f9fafb;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
}

.gallery__nav:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.65);
}

.gallery__nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.gallery__nav--prev {
  left: 1rem;
}

.gallery__nav--next {
  right: 1rem;
}

.gallery__footer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.gallery__meta {
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 1rem;
  color: #1f2933;
}

.gallery__thumb {
  border: none;
  background: #0f172a;
  padding: 0.35rem;
  border-radius: 0.65rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 140px;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
}

.gallery__thumb img {
  display: block;
  width: 100%;
  height: 100px;
  object-fit: contain;
  background: #0b1020;
  border-radius: 0.5rem;
}

.gallery__thumb-time {
  display: block;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
  color: #e5e7eb;
}

.gallery__thumb--active {
  outline: 3px solid #38bdf8;
}

.gallery__thumbnails {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

@media (max-width: 960px) {
  .gallery__stage {
    grid-template-columns: 1fr;
  }

  .gallery__thumbnails {
    flex-direction: row;
    max-height: none;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .gallery__thumb {
    width: 120px;
  }
}
</style>
