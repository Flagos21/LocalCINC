import express from 'express';
import { listDataMinFiles, loadLocalSeries } from '../localMagnetometer.js';
import { parseDateQuery, toUtcStart, toUtcEnd } from '../utils/date.js';
import { toFluxDuration } from '../utils/flux.js';

function createLocalMagnetometerRouter({ root, defaultStation, defaultDays }) {
  const router = express.Router();

  router.get('/days', async (req, res) => {
    const station = (req.query.station || defaultStation).toString().toUpperCase();

    try {
      const files = await listDataMinFiles({ root, station });

      res.json({
        station,
        days: files.map((file) => ({
          date: file.isoDate,
          filename: file.filename,
          timestamp: file.timestamp
        }))
      });
    } catch (err) {
      console.error('API /api/local-magnetometer/days error:', err);
      res.status(500).json({ error: 'No se pudieron listar los datos locales disponibles.' });
    }
  });

  router.get('/series', async (req, res) => {
    const station = (req.query.station || defaultStation).toString().toUpperCase();
    const dateParam = req.query.date?.toString();
    const fromParam = req.query.from?.toString();
    const toParam = req.query.to?.toString();

    try {
      const files = await listDataMinFiles({ root, station });

      if (!files.length) {
        res.status(404).json({ error: 'No se encontraron archivos locales para la estación indicada.' });
        return;
      }

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

        const iso = parsedDate.toISOString().slice(0, 10);
        const found = files.find((file) => file.isoDate === iso);

        if (!found) {
          res.status(404).json({ error: `No hay datos locales para la fecha ${iso}.` });
          return;
        }

        rangeStart = toUtcStart(parsedDate);
        rangeEnd = toUtcEnd(parsedDate);
      } else {
        const latestFile = files[files.length - 1];
        const earliestFile = files[0];

        const latestDate = latestFile ? new Date(latestFile.timestamp) : new Date();
        const earliestDate = earliestFile ? new Date(earliestFile.timestamp) : latestDate;

        const defaultEnd = toUtcEnd(latestDate);
        const defaultStart = toUtcStart(new Date(latestDate));
        defaultStart.setUTCDate(defaultStart.getUTCDate() - (defaultDays - 1));

        const earliestAllowed = toUtcStart(earliestDate);
        rangeStart = defaultStart.getTime() < earliestAllowed.getTime() ? earliestAllowed : defaultStart;
        rangeEnd = defaultEnd;
      }

      const seriesPayload = await loadLocalSeries({
        root,
        station,
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
            name: 'H',
            data: values
          }
        ],
        meta: {
          station,
          source: 'local-directory',
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
          from: seriesPayload.requestedRange.start,
          to: seriesPayload.requestedRange.end,
          availableRange: seriesPayload.availableRange,
          filename: seriesPayload.files.length === 1 ? seriesPayload.files[0].filename : null
        }
      });
    } catch (err) {
      console.error('API /api/local-magnetometer/series error:', err);
      res.status(500).json({ error: 'No se pudo obtener la serie local.' });
    }
  });

  return router;
}

export default createLocalMagnetometerRouter;
