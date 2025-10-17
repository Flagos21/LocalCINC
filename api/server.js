import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { InfluxDB } from '@influxdata/influxdb-client';

const app = express();
app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || '').split(',') || true }));
app.get('/health', (_, res) => res.json({ ok: true }));

const influx = new InfluxDB({ url: process.env.INFLUX_URL, token: process.env.INFLUX_TOKEN });
const queryApi = influx.getQueryApi(process.env.INFLUX_ORG);

app.get('/api/series', async (req, res) => {
  try {
    const { range = '24h', station = 'CHI', unit = 'nT', every = '1m' } = req.query;

    const flux = `
      from(bucket: "${process.env.INFLUX_BUCKET}")
        |> range(start: -${range})
        |> filter(fn: (r) => r._measurement == "magnetometer")
        |> filter(fn: (r) => r.station == "${station}")
        |> filter(fn: (r) => r._field == "H")
        |> filter(fn: (r) => r.unit == "${unit}")
        |> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)
        |> yield(name: "mean")
    `;

    const labels = [], data = [];
    await new Promise((resolve, reject) => {
      queryApi.queryRows(flux, {
        next(row, meta) {
          const o = meta.toObject(row);
          labels.push(o._time);
          data.push(o._value);
        },
        error: reject,
        complete: resolve
      });
    });

    res.json({ labels, series: [{ name: `H(${unit})`, data }] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT, () => console.log(`API listening on :${process.env.PORT}`));
