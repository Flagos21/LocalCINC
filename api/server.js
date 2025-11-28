/* eslint-env node */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { InfluxDB } from '@influxdata/influxdb-client';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'node:process';

import { mountKpApi, startCron, refreshNow } from './services/kpService.js';
import createDstRouter from './routes/dstRoutes.js';
import createIonogramRouter from './routes/ionogramRoutes.js';
import createLocalMagnetometerRouter from './routes/localMagnetometerRoutes.js';
import createElectricFieldRouter from './routes/electricFieldRoutes.js';
import createEfmRouter from './routes/efmRoutes.js';
import createMagnetometerRouter from './routes/magnetometerRoutes.js';
import createMagnetometerLiveRouter from './routes/magnetometerLiveRoutes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Monta el endpoint del Kp ya listo: GET /api/kp?days=3
mountKpApi(app, '/api/kp');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ionogramRoot = path.join(__dirname, 'ionograms');
const magnetometerLocalRoot = path.join(__dirname, 'magnetometro', 'DataMin');
const electricFieldRoot = path.join(__dirname, 'campoelectrico', 'cinc_efm');
const DEFAULT_LOCAL_MAGNETOMETER_DAYS = 7;

const {
  INFLUX_URL,
  INFLUX_TOKEN,
  INFLUX_ORG,
  INFLUX_BUCKET,
  MEASUREMENT = 'magnetometer',
  FIELD = 'H',
  DEFAULT_STATION = 'CHI',
  PORT = 3001,

  // ------- Configuración EFM live -------
  EFM_MEASUREMENT = 'efm',
  EFM_TAG_KEY = 'station',
  EFM_VALUE_FIELD = 'value',
  EFM_STATUS_FIELD = 'status',
  DEFAULT_EFM_SINCE = '30s',
  DEFAULT_EFM_EVERY = '1s',
  EFM_MAX_POINTS = '2000',

  // ------- Configuración Magnetómetro live -------
  MAGNETO_BUCKET = INFLUX_BUCKET,
  MAGNETO_MEASUREMENT = 'magnetometer',
  MAGNETO_TAG_KEY = 'station',
  MAGNETO_FIELD = 'h',
  DEFAULT_MAGNETO_SINCE = '1d',
  DEFAULT_MAGNETO_EVERY = '1m',
  MAGNETO_MAX_POINTS = '5000'
} = process.env;

if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
  console.error('❌ Falta configuración de Influx (URL/TOKEN/ORG/BUCKET) en .env');
  process.exit(1);
}

const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
const queryApi = influx.getQueryApi(INFLUX_ORG);

app.use('/api/dst', createDstRouter());
app.use('/api/ionograms', createIonogramRouter({ ionogramRoot }));
app.use(
  '/api/local-magnetometer',
  createLocalMagnetometerRouter({
    root: magnetometerLocalRoot,
    defaultStation: DEFAULT_STATION,
    defaultDays: DEFAULT_LOCAL_MAGNETOMETER_DAYS
  })
);
app.use('/api/electric-field', createElectricFieldRouter({ root: electricFieldRoot }));
app.use(
  '/api/efm',
  createEfmRouter({
    queryApi,
    bucket: INFLUX_BUCKET,
    measurement: EFM_MEASUREMENT,
    tagKey: EFM_TAG_KEY,
    valueField: EFM_VALUE_FIELD,
    statusField: EFM_STATUS_FIELD,
    defaultStation: DEFAULT_STATION,
    defaultSince: DEFAULT_EFM_SINCE,
    defaultEvery: DEFAULT_EFM_EVERY,
    maxPoints: EFM_MAX_POINTS
  })
);

// Nuevo: magnetómetro desde InfluxDB (live)
app.use(
  '/api/magnetometer-live',
  createMagnetometerLiveRouter({
    queryApi,
    bucket: MAGNETO_BUCKET,
    measurement: MAGNETO_MEASUREMENT,
    tagKey: MAGNETO_TAG_KEY,
    valueField: MAGNETO_FIELD,
    defaultStation: DEFAULT_STATION,
    defaultSince: DEFAULT_MAGNETO_SINCE,
    defaultEvery: DEFAULT_MAGNETO_EVERY,
    maxPoints: MAGNETO_MAX_POINTS
  })
);

// Rutas ya existentes (NO las tocamos)
app.use(
  '/api',
  createMagnetometerRouter({
    queryApi,
    bucket: INFLUX_BUCKET,
    measurement: MEASUREMENT,
    field: FIELD,
    defaultStation: DEFAULT_STATION,
    defaultUnit: 'nT'
  })
);

if (process.env.NODE_ENV !== 'test') {
  try {
    // primer fetch de datos Kp y arranque del cron
    await refreshNow();
    await startCron();
  } catch (err) {
    console.error('[Kp] Error en warm-up inicial:', err);
  }

  app.listen(Number(PORT), () => {
    console.log(`✅ API escuchando en http://localhost:${PORT}`);
  });
}

export default app;
