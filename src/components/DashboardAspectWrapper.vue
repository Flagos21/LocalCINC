<script setup>
import { computed } from 'vue'

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
  label: {
    type: String,
    default: 'Relación de aspecto',
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

const aspectValue = computed(() => {
  const [w, h] = String(props.modelValue)
    .split(':')
    .map((part) => Number(part.trim()))
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return 5 / 4
  }
  return w / h
})

function onChange(event) {
  emit('update:modelValue', event.target.value)
}
</script>

<template>
  <div class="dash-aspect" :style="{ '--aspect-value': aspectValue }">
    <div class="dash-aspect__ratio">
      <div class="dash-aspect__content">
        <slot />
      </div>
    </div>
    <div class="dash-aspect__toolbar">
      <label class="dash-aspect__select">
        <span>{{ label }}</span>
        <select :value="modelValue" @change="onChange">
          <option
            v-for="option in normalizedOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>

<style scoped>
.dash-aspect {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.dash-aspect__ratio {
  width: 100%;
  aspect-ratio: var(--aspect-value);
  display: flex;
}

.dash-aspect__content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

.dash-aspect__content > * {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

.dash-aspect__toolbar {
  display: flex;
  justify-content: flex-end;
}

.dash-aspect__select {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: rgba(15, 23, 42, 0.05);
  color: #0f172a;
  font-size: 0.78rem;
  font-weight: 600;
}

.dash-aspect__select select {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0;
  outline: none;
}

@media (max-width: 640px) {
  .dash-aspect__toolbar {
    justify-content: center;
  }

  .dash-aspect__select {
    font-size: 0.72rem;
  }

  .dash-aspect__select select {
    font-size: 0.76rem;
  }
}
</style>
