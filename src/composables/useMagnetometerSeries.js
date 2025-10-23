import { isRef, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import dayjs from 'dayjs';

export function useMagnetometerSeries({
  range,
  every,
  unit,
  station,
  from,
  to,
  endpoint
} = {}) {
  const rangeRef = isRef(range) ? range : ref(range ?? '24h');
  const everyRef = isRef(every) ? every : ref(every ?? '1m');
  const unitRef = isRef(unit) ? unit : ref(unit ?? 'nT');
  const stationRef = isRef(station) ? station : ref(station ?? 'CHI');
  const fromRef = isRef(from) ? from : ref(from ?? '');
  const toRef = isRef(to) ? to : ref(to ?? '');
  const endpointRef = isRef(endpoint) ? endpoint : ref(endpoint ?? '/api/series');

  const labels = ref([]);
  const series = ref([]);
  const isLoading = ref(false);
  const errorMessage = ref('');
  const meta = ref(null);
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

    const parsedFrom = fromValue ? dayjs(fromValue) : null;
    const parsedTo = toValue ? dayjs(toValue) : null;

    if ((parsedFrom && !parsedFrom.isValid()) || (parsedTo && !parsedTo.isValid())) {
      errorMessage.value = 'Selecciona un rango de fechas válido.';
      labels.value = [];
      series.value = [];
      if (abortController.value === controller) {
        abortController.value = undefined;
      }
      isLoading.value = false;
      return;
    }

    if (parsedFrom && parsedTo && parsedFrom.isAfter(parsedTo)) {
      errorMessage.value = 'La fecha inicial no puede ser posterior a la final.';
      labels.value = [];
      series.value = [];
      if (abortController.value === controller) {
        abortController.value = undefined;
      }
      isLoading.value = false;
      return;
    }

    if ((fromValue && !toValue) || (!fromValue && toValue)) {
      if (abortController.value === controller) {
        abortController.value = undefined;
      }
      isLoading.value = false;
      return;
    }

    labels.value = [];
    series.value = [];
    meta.value = null;

    const searchParams = new URLSearchParams();

    if (stationRef.value) {
      searchParams.set('station', stationRef.value);
    }

    if (everyRef.value) {
      searchParams.set('every', everyRef.value);
    }

    if (unitRef.value) {
      searchParams.set('unit', unitRef.value);
    }

    if (parsedFrom && parsedTo) {
      searchParams.set('from', parsedFrom.format('YYYY-MM-DDTHH:mm'));
      searchParams.set('to', parsedTo.format('YYYY-MM-DDTHH:mm'));
    } else if (rangeRef.value) {
      searchParams.set('range', rangeRef.value);
    }

    try {
      const endpointUrl = endpointRef.value || '/api/series';
      const response = await fetch(`${endpointUrl}?${searchParams.toString()}`, {
        signal: controller.signal
      });

      const rawBody = await response.text();
      const contentType = response.headers.get('content-type') || '';
      let payload;

      if (rawBody) {
        if (contentType.includes('application/json') || contentType.includes('+json')) {
          try {
            payload = JSON.parse(rawBody);
          } catch {
            const snippet = rawBody.slice(0, 140).replace(/\s+/g, ' ').trim();
            throw new Error(
              snippet
                ? `La respuesta no es JSON válido. Detalle: "${snippet}${rawBody.length > 140 ? '…' : ''}"`
                : 'La respuesta no es JSON válido.'
            );
          }
        }
      }

      if (!response.ok) {
        const message = payload?.error || 'No se pudieron obtener los datos del servicio.';
        throw new Error(message);
      }

      if (!payload) {
        throw new Error('La respuesta no es JSON válido.');
      }

      const incomingLabels = Array.isArray(payload.labels) ? payload.labels : [];
      const incomingSeries = Array.isArray(payload.series?.[0]?.data)
        ? payload.series[0].data.map((value) => Number.parseFloat(value))
        : [];

      const length = Math.min(incomingLabels.length, incomingSeries.length);
      labels.value = incomingLabels.slice(0, length);
      series.value = incomingSeries.slice(0, length);
      meta.value = payload.meta ?? null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const message = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
      errorMessage.value = message;
      labels.value = [];
      series.value = [];
      meta.value = null;
    } finally {
      if (abortController.value === controller) {
        abortController.value = undefined;
      }
      isLoading.value = false;
    }
  };

  onMounted(fetchData);

  watch([rangeRef, everyRef, unitRef, stationRef, fromRef, toRef, endpointRef], () => {
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
    to: toRef,
    meta
  };
}
