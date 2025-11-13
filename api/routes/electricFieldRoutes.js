import express from 'express';
import { loadElectricFieldSeries } from '../localElectricField.js';
import { parseDateQuery, toUtcStart, toUtcEnd } from '../utils/date.js';
import { toFluxDuration } from '../utils/flux.js';

function createElectricFieldRouter({ root }) {
  const router = express.Router();

  router.get('/series', async (req, res) => {
    const stationParam = req.query.station?.toString().trim() ?? '';
    const dateParam = req.query.date?.toString();
    const fromParam = req.query.from?.toString();
    const toParam = req.query.to?.toString();

    try {
      let rangeStart;
      let rangeEnd;

      if (fromParam || toParam) {
        if (!fromParam || !toParam) {
          res.status(400).json({ error: 'Parámetros from y to requeridos para intervalos personalizados.' });
          return;
        }

        const parsedFrom = parseDateQuery(fromParam, { isEnd: false });
        const parsedTo = parseDateQuery(toParam, { isEnd: true });

        if (!parsedFrom || !parsedTo) {
          res.status(400).json({ error: 'Parámetros from/to inválidos. Usa formato YYYY-MM-DD o YYYY-MM-DDTHH:mm.' });
          return;
        }

        if (parsedFrom.getTime() > parsedTo.getTime()) {
          res.status(400).json({ error: 'La fecha inicial no puede ser posterior a la final.' });
          return;
        }

        rangeStart = parsedFrom;
        rangeEnd = parsedTo;
      } else if (dateParam) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
          res.status(400).json({ error: 'Parámetro date inválido. Usa YYYY-MM-DD.' });
          return;
        }

        const parsedDate = parseDateQuery(dateParam);
        if (!parsedDate) {
          res.status(400).json({ error: 'Parámetro date inválido. Usa YYYY-MM-DD.' });
          return;
        }

        rangeStart = toUtcStart(parsedDate);
        rangeEnd = toUtcEnd(parsedDate);
      }

      const seriesPayload = await loadElectricFieldSeries({
        root,
        station: stationParam || undefined,
        rangeStart,
        rangeEnd,
        targetPoints: 4000
      });

      if (!seriesPayload.points.length) {
        res.status(404).json({ error: 'No hay datos locales disponibles para el intervalo solicitado.' });
        return;
      }

      const labels = seriesPayload.points.map((point) => point.t);
      const values = seriesPayload.points.map((point) => point.v);
      const startLabel = labels[0] ?? null;
      const endLabel = labels[labels.length - 1] ?? null;

      res.json({
        labels,
        series: [
          {
            name: 'E_z',
            data: values
          }
        ],
        meta: {
          station: stationParam || null,
          stationsAvailable: seriesPayload.stations,
          stationsMatched: seriesPayload.matchedStations,
          points: labels.length,
          originalPoints: seriesPayload.totalPoints,
          bucket: seriesPayload.bucketMs
            ? {
                size: toFluxDuration(seriesPayload.bucketMs),
                ms: seriesPayload.bucketMs,
                downsampled: seriesPayload.downsampled,
                returned: labels.length,
                original: seriesPayload.totalPoints
              }
            : null,
          range: startLabel && endLabel ? { start: startLabel, end: endLabel } : null,
          files: seriesPayload.files,
          from: seriesPayload.requestedRange?.start,
          to: seriesPayload.requestedRange?.end,
          availableRange: seriesPayload.availableRange
        }
      });
    } catch (err) {
      console.error('API /api/electric-field/series error:', err);
      res.status(500).json({ error: 'No se pudo obtener la serie de campo eléctrico local.' });
    }
  });

  return router;
}

export default createElectricFieldRouter;
