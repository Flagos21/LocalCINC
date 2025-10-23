<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

const props = defineProps({
  panelId: {
    type: String,
    required: true,
  },
  containerRef: {
    type: Object,
    required: true,
  },
  defaultPosition: {
    type: Object,
    default: () => ({ x: 0, y: 0 }),
  },
  defaultSize: {
    type: Object,
    default: () => ({ width: 420, height: 360 }),
  },
  minSize: {
    type: Object,
    default: () => ({ width: 320, height: 240 }),
  },
  maxSize: {
    type: Object,
    default: () => ({ width: 960, height: 720 }),
  },
  order: {
    type: Number,
    default: 0,
  },
})

const panelRef = ref(null)
const resizeHandleRef = ref(null)

const state = reactive({
  x: props.defaultPosition?.x ?? 0,
  y: props.defaultPosition?.y ?? 0,
  width: props.defaultSize?.width ?? 420,
  height: props.defaultSize?.height ?? 360,
})

const dragSession = ref(null)
const resizeSession = ref(null)

const storageKey = computed(() => `home-dashboard:${props.panelId}`)

function clamp(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function getContainerMetrics() {
  const el = props.containerRef?.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height,
  }
}

function applyBounds(next) {
  const metrics = getContainerMetrics()
  const minWidth = props.minSize?.width ?? 200
  const minHeight = props.minSize?.height ?? 200
  const maxWidthProp = props.maxSize?.width ?? Number.POSITIVE_INFINITY
  const maxHeightProp = props.maxSize?.height ?? Number.POSITIVE_INFINITY

  let width = clamp(next.width, minWidth, maxWidthProp)
  let height = clamp(next.height, minHeight, maxHeightProp)

  if (metrics) {
    width = clamp(width, minWidth, Math.max(minWidth, metrics.width))
    height = clamp(height, minHeight, Math.max(minHeight, metrics.height))
  }

  if (!metrics) {
    return { x: next.x, y: next.y, width, height }
  }

  const availableWidth = metrics.width
  const availableHeight = metrics.height
  const maxX = Math.max(0, availableWidth - width)
  const maxY = Math.max(0, availableHeight - height)

  const desiredX = clamp(next.x, 0, maxX)
  let desiredY = clamp(next.y, 0, maxY)

  const overflowedHorizontally = next.x > maxX || width >= availableWidth

  if (overflowedHorizontally && availableWidth < width * 1.75) {
    const stackGap = 24
    const stackedY = props.order * (height + stackGap) + stackGap
    desiredY = clamp(Math.max(desiredY, stackedY), 0, maxY)
    return { x: clamp(16, 16, maxX), y: desiredY, width, height }
  }

  return { x: desiredX, y: desiredY, width, height }
}

function loadState() {
  try {
    const raw = localStorage.getItem(storageKey.value)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return
    const next = applyBounds({
      x: Number(parsed.x) || 0,
      y: Number(parsed.y) || 0,
      width: Number(parsed.width) || state.width,
      height: Number(parsed.height) || state.height,
    })
    state.x = next.x
    state.y = next.y
    state.width = next.width
    state.height = next.height
  } catch (error) {
    console.warn('No se pudo restaurar posición del panel', error)
  }
}

function persistState() {
  const payload = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  }
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(payload))
  } catch (error) {
    console.warn('No se pudo guardar posición del panel', error)
  }
}

function startDrag(event) {
  if (event.button !== 0) return
  if (event.target.closest('[data-no-drag]')) return
  if (['BUTTON', 'SELECT', 'INPUT', 'TEXTAREA', 'A'].includes(event.target.tagName)) return
  const container = props.containerRef?.value
  if (!panelRef.value || !container) return
  event.preventDefault()
  panelRef.value.setPointerCapture?.(event.pointerId)
  dragSession.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    baseX: state.x,
    baseY: state.y,
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onDragMove(event) {
  if (!dragSession.value || event.pointerId !== dragSession.value.pointerId) return
  const dx = event.clientX - dragSession.value.startX
  const dy = event.clientY - dragSession.value.startY
  const next = applyBounds({
    x: dragSession.value.baseX + dx,
    y: dragSession.value.baseY + dy,
    width: state.width,
    height: state.height,
  })
  state.x = next.x
  state.y = next.y
}

function endDrag(event) {
  if (!dragSession.value || event.pointerId !== dragSession.value.pointerId) return
  panelRef.value?.releasePointerCapture?.(event.pointerId)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  dragSession.value = null
  persistState()
}

function startResize(event) {
  if (event.button !== 0) return
  const container = props.containerRef?.value
  if (!panelRef.value || !container) return
  event.preventDefault()
  resizeHandleRef.value?.setPointerCapture?.(event.pointerId)
  resizeSession.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    baseWidth: state.width,
    baseHeight: state.height,
    baseX: state.x,
    baseY: state.y,
  }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
}

function onResizeMove(event) {
  if (!resizeSession.value || event.pointerId !== resizeSession.value.pointerId) return
  const dx = event.clientX - resizeSession.value.startX
  const dy = event.clientY - resizeSession.value.startY
  const next = applyBounds({
    x: resizeSession.value.baseX,
    y: resizeSession.value.baseY,
    width: resizeSession.value.baseWidth + dx,
    height: resizeSession.value.baseHeight + dy,
  })
  state.width = next.width
  state.height = next.height
  state.x = next.x
  state.y = next.y
}

function endResize(event) {
  if (!resizeSession.value || event.pointerId !== resizeSession.value.pointerId) return
  resizeHandleRef.value?.releasePointerCapture?.(event.pointerId)
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  resizeSession.value = null
  persistState()
}

function handleWindowResize() {
  const next = applyBounds({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  })
  state.x = next.x
  state.y = next.y
  state.width = next.width
  state.height = next.height
}

onMounted(async () => {
  loadState()
  await nextTick()
  handleWindowResize()
  window.addEventListener('resize', handleWindowResize)
})

watch(
  () => props.containerRef?.value,
  () => {
    handleWindowResize()
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
})

const panelStyle = computed(() => ({
  width: `${state.width}px`,
  height: `${state.height}px`,
  transform: `translate3d(${state.x}px, ${state.y}px, 0)`,
}))
</script>

<template>
  <div
    ref="panelRef"
    class="draggable-panel"
    :style="panelStyle"
    role="group"
    tabindex="0"
    aria-label="Panel ajustable"
    @pointerdown="startDrag"
  >
    <div class="draggable-panel__content">
      <slot />
    </div>
  <button
    ref="resizeHandleRef"
    class="draggable-panel__resize"
    type="button"
    aria-label="Ajustar tamaño del panel"
    @pointerdown.stop="startResize"
  ></button>
  </div>
</template>

<style scoped>
.draggable-panel {
  position: absolute;
  top: 0;
  left: 0;
  touch-action: none;
  user-select: none;
  transition: box-shadow 0.2s ease;
  cursor: grab;
}

.draggable-panel:active {
  cursor: grabbing;
}

.draggable-panel:focus-within,
.draggable-panel:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.35);
}

.draggable-panel__content {
  width: 100%;
  height: 100%;
  pointer-events: auto;
  user-select: auto;
}

.draggable-panel__resize {
  position: absolute;
  right: 0.35rem;
  bottom: 0.35rem;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 0.35rem;
  border: 1px solid rgba(15, 23, 42, 0.18);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.15);
  cursor: se-resize;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.draggable-panel__resize::before {
  content: '';
  width: 60%;
  height: 60%;
  background: conic-gradient(from 45deg, transparent 0 25%, rgba(30, 64, 175, 0.75) 25% 50%, transparent 50% 75%, rgba(30, 64, 175, 0.75) 75%);
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
  border-radius: 0 0.35rem 0.35rem 0;
}

.draggable-panel__resize:active {
  background: rgba(37, 99, 235, 0.12);
}
</style>
