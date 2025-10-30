<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '5:4',
  },
  options: {
    type: Array,
    default: () => [
      { value: '5:4', label: '5:4' },
      { value: '4:3', label: '4:3' },
      { value: '3:2', label: '3:2' },
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
    ],
  },
  title: {
    type: String,
    default: 'Cambiar relación de aspecto',
  },
})

const emit = defineEmits(['update:modelValue'])

const normalizedOptions = computed(() =>
  props.options.map((entry) =>
    typeof entry === 'string'
      ? { value: entry, label: entry }
      : { value: entry.value, label: entry.label ?? entry.value }
  )
)

const isOpen = ref(false)
const rootEl = ref(null)

function close() {
  isOpen.value = false
}

function toggle() {
  isOpen.value = !isOpen.value
}

function onSelect(value) {
  emit('update:modelValue', value)
  close()
}

function handleDocumentClick(event) {
  if (!isOpen.value) {
    return
  }

  const target = event.target
  if (rootEl.value && target instanceof Node && !rootEl.value.contains(target)) {
    close()
  }
}

function handleEscape(event) {
  if (event.key === 'Escape') {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick, true)
  document.addEventListener('keyup', handleEscape, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick, true)
  document.removeEventListener('keyup', handleEscape, true)
})
</script>

<template>
  <div ref="rootEl" class="aspect-control" :class="{ 'is-open': isOpen }">
    <button
      class="aspect-control__trigger"
      type="button"
      :title="title"
      :aria-label="title"
      :aria-expanded="isOpen"
      @click.stop="toggle"
    >
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <rect x="3" y="5" width="18" height="14" rx="3" ry="3" />
        <path d="M7 9h10v6H7z" />
      </svg>
    </button>

    <transition name="aspect-control__fade">
      <ul v-if="isOpen" class="aspect-control__menu" role="listbox">
        <li v-for="option in normalizedOptions" :key="option.value">
          <button
            type="button"
            class="aspect-control__option"
            :class="{ 'is-active': option.value === modelValue }"
            role="option"
            :aria-selected="option.value === modelValue"
            @click.stop="onSelect(option.value)"
          >
            {{ option.label }}
          </button>
        </li>
      </ul>
    </transition>
  </div>
</template>

<style scoped>
.aspect-control {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.aspect-control__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.65);
  background: rgba(248, 250, 252, 0.85);
  color: #0f172a;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}

.aspect-control__trigger:hover,
.aspect-control.is-open .aspect-control__trigger {
  background: rgba(248, 250, 252, 0.95);
  border-color: rgba(37, 99, 235, 0.7);
}

.aspect-control__trigger svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: currentColor;
}

.aspect-control__menu {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.55rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.97);
  border: 1px solid rgba(148, 163, 184, 0.4);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.35);
  min-width: 7rem;
  z-index: 40;
}

.aspect-control__option {
  width: 100%;
  padding: 0.35rem 0.65rem;
  border-radius: 0.5rem;
  background: transparent;
  border: none;
  color: #e2e8f0;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.aspect-control__option:hover,
.aspect-control__option:focus-visible {
  background: rgba(37, 99, 235, 0.25);
  outline: none;
}

.aspect-control__option.is-active {
  background: rgba(37, 99, 235, 0.4);
  color: #f8fafc;
}

.aspect-control__fade-enter-active,
.aspect-control__fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.aspect-control__fade-enter-from,
.aspect-control__fade-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}
</style>
