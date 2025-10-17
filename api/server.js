import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { InfluxDB } from '@influxdata/influxdb-client';

const app = express();
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(',') || true }));

app.get('/health', (_, res) => res.json({ ok: true }));

// Conexión a InfluxDB
const influx = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN
});
const queryApi = influx.getQueryApi(process.env.INFLUX_ORG);

/** 🔹 Mapeo de rangos humanos → duración Flux */
function resolveRange(range) {
  const map = {
    '6h': '-6h',
    '12h': '-12h',
    '24h': '-24h',
    '48h': '-48h',
    '7d': '-7d',
    '90d': '-90d',
    '1y': '-365d',
    '2y': '-730d',
    'all': '0', // 0 = desde el principio (todas las fechas)
  };
  return map[range] || '-365d';
}

/** 🔹 Endpoint principal para las series */
app.get('/api/series', async (req, res) => {
  try {
    const {
      range = '24h',
      station = 'CHI',
      unit = 'nT',
      every = '1m'
    } = req.query;

    const fluxRange = resolveRange(range);

    // Consulta principal
    let flux = `
      from(bucket: "${process.env.INFLUX_BUCKET}")
        |> range(start: ${fluxRange})
        |> filter(fn: (r) => r._measurement == "magnetometer")
        |> filter(fn: (r) => r.station == "${station}")
        |> filter(fn: (r) => r._field == "H")
        |> filter(fn: (r) => r.unit == "${unit}")
        |> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)
        |> yield(name: "mean")
    `;

    const labels = [];
    const data = [];

    const executeQuery = async (query) => {
      await new Promise((resolve, reject) => {
        queryApi.queryRows(query, {
          next(row, meta) {
            const o = meta.toObject(row);
            labels.push(o._time);
            data.push(o._value);
          },
          error: reject,
          complete: resolve,
        });
      });
    };

    await executeQuery(flux);

    // Si no hay datos, busca el último punto y arma un rango centrado en él
    if (!data.length) {
      console.warn(`[INFO] No se encontraron datos en el rango ${range}. Buscando el último punto...`);

      const lastFlux = `
        from(bucket: "${process.env.INFLUX_BUCKET}")
          |> range(start: 0)
          |> filter(fn: (r) => r._measurement == "magnetometer" and r.station == "${station}" and r._field == "H" and r.unit == "${unit}")
          |> last()
      `;

      const lastRows = [];
      await new Promise((resolve, reject) => {
        queryApi.queryRows(lastFlux, {
          next(row, meta) {
            const o = meta.toObject(row);
            lastRows.push(o);
          },
          error: reject,
          complete: resolve,
        });
      });

      if (lastRows.length) {
        const lastTs = new Date(lastRows[0]._time).toISOString();
        console.log(`[INFO] Último dato encontrado en ${lastTs}. Consultando ±24h...`);

        const fallbackFlux = `
          from(bucket: "${process.env.INFLUX_BUCKET}")
            |> range(start: time(v: "${lastTs}") - 24h, stop: time(v: "${lastTs}") + 24h)
            |> filter(fn: (r) => r._measurement == "magnetometer" and r.station == "${station}" and r._field == "H" and r.unit == "${unit}")
            |> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)
            |> yield(name: "mean")
        `;
        await executeQuery(fallbackFlux);
      }
    }

    res.json({ labels, series: [{ name: `H(${unit})`, data }] });
  } catch (e) {
    console.error('[ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** 🔹 Puerto configurado */
app.listen(process.env.PORT || 3001, () =>
  console.log(`API listening on :${process.env.PORT || 3001}`)
);
