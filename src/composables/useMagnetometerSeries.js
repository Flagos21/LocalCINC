import { isRef, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export function useMagnetometerSeries({
  range,
  every,
  unit,
  station,
  from,
  to
} = {}) {
  const rangeRef = isRef(range) ? range : ref(range ?? '24h');
  const everyRef = isRef(every) ? every : ref(every ?? '1m');
  const unitRef = isRef(unit) ? unit : ref(unit ?? 'nT');
  const stationRef = isRef(station) ? station : ref(station ?? 'CHI');
  const fromRef = isRef(from) ? from : ref(from ?? '');
  const toRef = isRef(to) ? to : ref(to ?? '');

  const labels = ref([]);
  const series = ref([]);
  const isLoading = ref(false);
  const errorMessage = ref('');
  const abortController = ref();

  const fetchData = async () => {
    if (abortController.value) {
      abortController.value.abort();
    }

    const controller = new AbortController();
    abortController.value = controller;
    isLoading.value = true;
    errorMessage.value = '';

    const fromValue = fromRef.value;
    const toValue = toRef.value;

    if ((fromValue && !toValue) || (!fromValue && toValue)) {
      errorMessage.value = 'Debes indicar una fecha inicial y final.';
      labels.value = [];
      series.value = [];
      if (abortController.value === controller) {
        abortController.value = undefined;
      }
      isLoading.value = false;
      return;
    }

    const searchParams = new URLSearchParams({
      station: stationRef.value,
      every: everyRef.value,
      unit: unitRef.value
    });

    if (fromValue && toValue) {
      searchParams.set('from', fromValue);
      searchParams.set('to', toValue);
    } else {
      searchParams.set('range', rangeRef.value);
    }

    try {
      const response = await fetch(`/api/series?${searchParams.toString()}`, {
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error('No se pudieron obtener los datos del servicio.');
      }

      const rawBody = await response.text();
      const contentType = response.headers.get('content-type') || '';
      let payload;

      try {
        if (contentType.includes('application/json') || contentType.includes('+json')) {
          payload = JSON.parse(rawBody);
        } else {
          throw new Error();
        }
      } catch (error) {
        const snippet = rawBody.slice(0, 140).replace(/\s+/g, ' ').trim();
        throw new Error(
          snippet
            ? `La respuesta no es JSON válido. Detalle: "${snippet}${rawBody.length > 140 ? '…' : ''}"`
            : 'La respuesta no es JSON válido.'
        );
      }

      const incomingLabels = Array.isArray(payload.labels) ? payload.labels : [];
      const incomingSeries = Array.isArray(payload.series?.[0]?.data)
        ? payload.series[0].data.map((value) => Number.parseFloat(value))
        : [];

      const length = Math.min(incomingLabels.length, incomingSeries.length);
      labels.value = incomingLabels.slice(0, length);
      series.value = incomingSeries.slice(0, length);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const message = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
      errorMessage.value = message;
      labels.value = [];
      series.value = [];
    } finally {
      if (abortController.value === controller) {
        abortController.value = undefined;
      }
      isLoading.value = false;
    }
  };

  onMounted(fetchData);

  watch([rangeRef, everyRef, unitRef, stationRef, fromRef, toRef], () => {
    fetchData();
  });

  onBeforeUnmount(() => {
    if (abortController.value) {
      abortController.value.abort();
    }
  });

  return {
    labels,
    series,
    isLoading,
    errorMessage,
    fetchData,
    from: fromRef,
    to: toRef
  };
}
