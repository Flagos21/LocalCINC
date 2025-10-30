<script setup>
import { computed, nextTick, ref } from 'vue';

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ start: '', end: '' })
  },
  min: {
    type: String,
    default: ''
  },
  max: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue']);

const startInput = ref();
const endInput = ref();

const uniqueId = `date-range-${Math.random().toString(36).slice(2, 8)}`;
const startId = `${uniqueId}-start`;
const endId = `${uniqueId}-end`;

const startValue = computed(() => props.modelValue?.start ?? '');
const endValue = computed(() => props.modelValue?.end ?? '');

const updateRange = ({ start = startValue.value, end = endValue.value } = {}) => {
  emit('update:modelValue', { start, end });
};

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
};

const hasCompleteRange = computed(() => Boolean(startValue.value && endValue.value));

const displayValue = computed(() => {
  if (!startValue.value && !endValue.value) {
    return 'Selecciona un intervalo de fechas';
  }

  if (startValue.value && !endValue.value) {
    return `Desde ${formatDate(startValue.value)}`;
  }

  if (!startValue.value && endValue.value) {
    return `Hasta ${formatDate(endValue.value)}`;
  }

  if (startValue.value === endValue.value) {
    return formatDate(startValue.value);
  }

  return `${formatDate(startValue.value)} — ${formatDate(endValue.value)}`;
});

const openStartPicker = () => {
  startInput.value?.showPicker?.();
};

const openEndPicker = () => {
  endInput.value?.showPicker?.();
};

const onStartChange = (event) => {
  const value = event.target.value;

  if (!value) {
    updateRange({ start: '', end: '' });
    return;
  }

  let end = endValue.value;
  if (end && end < value) {
    end = value;
  }

  updateRange({ start: value, end });

  nextTick(() => {
    if (!end) {
      openEndPicker();
    }
  });
};

const onEndChange = (event) => {
  const value = event.target.value;

  if (!value) {
    updateRange({ end: '' });
    return;
  }

  let start = startValue.value;
  if (start && start > value) {
    start = value;
  }

  if (!start) {
    start = value;
  }

  updateRange({ start, end: value });
};

const clearRange = () => {
  updateRange({ start: '', end: '' });
};
</script>

<template>
  <div class="date-range-picker">
    <button type="button" class="date-range-picker__display" @click="openStartPicker">
      <span>{{ displayValue }}</span>
    </button>

    <div class="date-range-picker__inputs">
      <label class="sr-only" :for="startId">Fecha inicial</label>
      <input
        :id="startId"
        ref="startInput"
        class="date-range-picker__input"
        type="date"
        :value="startValue"
        :max="endValue || max"
        :min="min"
        @change="onStartChange"
      />

      <label class="sr-only" :for="endId">Fecha final</label>
      <input
        :id="endId"
        ref="endInput"
        class="date-range-picker__input"
        type="date"
        :value="endValue"
        :min="startValue || min"
        :max="max"
        @change="onEndChange"
      />
    </div>

    <button
      v-if="hasCompleteRange"
      type="button"
      class="date-range-picker__clear"
      @click="clearRange"
      aria-label="Limpiar intervalo de fechas"
    >
      Limpiar
    </button>
  </div>
</template>

<style scoped>
.date-range-picker {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  position: relative;
}

.date-range-picker__display {
  flex: 1;
  text-align: left;
  border-radius: 0.5rem;
  border: 1px solid #d3dae6;
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  color: #1f2933;
  background: #f8fafc;
  cursor: pointer;
}

.date-range-picker__display:hover,
.date-range-picker__display:focus-visible {
  border-color: #2563eb;
  outline: none;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.date-range-picker__inputs {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
}

.date-range-picker__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.date-range-picker__clear {
  font-size: 0.85rem;
  color: #2563eb;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.date-range-picker__clear:hover,
.date-range-picker__clear:focus-visible {
  text-decoration: underline;
  outline: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
