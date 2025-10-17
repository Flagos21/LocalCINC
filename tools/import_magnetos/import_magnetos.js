import 'dotenv/config';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { globby } from 'globby';
import fs from 'fs';
import path from 'path';

// ───────────────────────────────────────────────────────────────────────────────
// ENV
// ───────────────────────────────────────────────────────────────────────────────
const {
  INFLUX_URL,
  INFLUX_TOKEN,
  INFLUX_ORG,
  INFLUX_BUCKET,
  DATA_DIR,
  STATION,

  // Tuning opcional (con valores por defecto conservadores)
  BATCH_SIZE = '1000',          // menor lote = menos presión sobre la red/servidor
  FLUSH_INTERVAL = '1000',      // ms entre flush automáticos
  MAX_RETRIES = '5',            // reintentos internos del cliente por lote
  MAX_BUFFER_LINES = '50000',   // tamaño del buffer del cliente
  MAX_RETRY_TIME = '60000',     // ms
  GZIP = 'true',                // comprimir escritura
  THROTTLE_EVERY = '10000',     // pausa cada N puntos escritos
  THROTTLE_MS = '200'           // ms de pausa
} = process.env;

if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
  console.error('Faltan variables de entorno de Influx. Revisa .env');
  process.exit(1);
}
if (!DATA_DIR) {
  console.error('Define DATA_DIR en .env apuntando a tu carpeta de archivos.');
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Influx WriteAPI (con opciones de robustez)
// ───────────────────────────────────────────────────────────────────────────────
function newWriteApi() {
  const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
  const writeApi = influx.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ns', {
    batchSize: parseInt(BATCH_SIZE, 10),
    flushInterval: parseInt(FLUSH_INTERVAL, 10),
    maxRetries: parseInt(MAX_RETRIES, 10),
    maxBufferLines: parseInt(MAX_BUFFER_LINES, 10),
    maxRetryTime: parseInt(MAX_RETRY_TIME, 10),
    exponentialBase: 2
  });
  writeApi.useGzip = String(GZIP).toLowerCase() === 'true';
  return writeApi;
}

let writeApi = newWriteApi();

// ───────────────────────────────────────────────────────────────────────────────
// Utilidades
// ───────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function inferStationFromFilename(filename) {
  // ej: chi02oct.25m -> CHI
  const m = filename.match(/^([a-zA-Z]{3})/);
  return m ? m[1].toUpperCase() : 'UNK';
}

function parseFileContent(content) {
  const lines = content.split(/\r?\n/);
  let headerIdx = -1;
  let titles = [];

  // Busca línea de títulos (que incluye "DD MM YYYY HH MM")
  for (let i = 0; i < Math.min(200, lines.length); i++) {
    if (/\bDD\s+MM\s+YYYY\s+HH\s+MM\b/.test(lines[i])) {
      headerIdx = i;
      titles = lines[i].trim().split(/\s+/);
      break;
    }
  }
  if (headerIdx < 0) return [];

  // Título de H (H(nT) o H(mV))
  let hTitle = titles.find((t) => /^H\(.+\)$/.test(t));
  if (!hTitle) return [];
  const unit = hTitle.slice(hTitle.indexOf('(') + 1, hTitle.indexOf(')'));
  const hIdx = titles.indexOf(hTitle);

  // Datos
  let dataStart = headerIdx + 1;
  while (dataStart < lines.length && !lines[dataStart].trim()) dataStart++;

  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^CHILLAN/.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length < hIdx + 1) continue;

    const [DD, MM, YYYY, HH, Min] = parts.slice(0, 5).map((x) => parseInt(x, 10));
    if ([DD, MM, YYYY, HH, Min].some(Number.isNaN)) continue;

    const metrics = parts.slice(5);
    const valuePos = hIdx - 5;
    if (valuePos < 0 || valuePos >= metrics.length) continue;

    const H = parseFloat(metrics[valuePos]);
    if (Number.isNaN(H)) continue;

    // timestamps en UTC
    const ts = new Date(Date.UTC(YYYY, MM - 1, DD, HH, Min, 0, 0));
    rows.push({ ts, H, unit });
  }
  return rows;
}

// ───────────────────────────────────────────────────────────────────────────────
// Manejo de errores comunes
// ───────────────────────────────────────────────────────────────────────────────
function isRetentionError(err) {
  const msg = (err?.body || err?.message || '').toString();
  return msg.includes('outside retention policy') ||
         msg.includes('violates a Retention Policy Lower Bound');
}
function isConnReset(err) {
  return (err?.code === 'ECONNRESET') || /ECONNRESET/i.test(err?.message || '');
}

// Reintento con backoff cuando hay ECONNRESET en flush/close
async function safeFlush(label = '') {
  const max = 5;
  let attempt = 0;
  while (true) {
    try {
      await writeApi.flush();
      return;
    } catch (err) {
      attempt++;
      if (isConnReset(err)) {
        console.warn(`WARN: flush ECONNRESET (${label}) intento ${attempt}/${max}`);
        // recrea el writeApi tras un reset para limpiar sockets quebrados
        try { await writeApi.close().catch(() => {}); } catch {}
        writeApi = newWriteApi();
        if (attempt < max) {
          await sleep(500 * attempt); // backoff incremental
          continue;
        }
      }
      // otros errores: propágalo
      throw err;
    }
  }
}

async function safeClose() {
  try {
    await writeApi.close();
  } catch (err) {
    if (isConnReset(err)) {
      console.warn('WARN: close ECONNRESET (ignorado tras fin del proceso)');
      return;
    }
    throw err;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Import principal
// ───────────────────────────────────────────────────────────────────────────────
async function importFolder(dir) {
  const files = await globby(['**/*'], { cwd: dir, absolute: true, onlyFiles: true });

  // Ordena por nombre para tener progresión temporal predecible (suele ayudar al servidor)
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  console.log(`Archivos encontrados: ${files.length}`);

  let count = 0;
  const throttleEvery = parseInt(THROTTLE_EVERY, 10);
  const throttleMs = parseInt(THROTTLE_MS, 10);

  for (const f of files) {
    const fname = path.basename(f);
    const station = STATION || inferStationFromFilename(fname);
    const content = fs.readFileSync(f, 'utf-8');
    const rows = parseFileContent(content);

    if (!rows.length) {
      console.warn(`(omitido) ${fname} — formato no reconocido o sin columna H`);
      continue;
    }

    // Escribe puntos de este archivo
    let wroteForFile = 0;
    for (const r of rows) {
      const p = new Point('magnetometer')
        .tag('station', station)
        .tag('unit', r.unit)     // nT o mV
        .tag('file', fname)
        .floatField('H', r.H)
        .timestamp(r.ts);

      writeApi.writePoint(p);
      count++;
      wroteForFile++;

      if (count % parseInt(BATCH_SIZE, 10) === 0) {
        try {
          await safeFlush(`batch-${count}`);
        } catch (err) {
          if (isRetentionError(err)) {
            console.warn(`WARN: Retention: puntos fuera de política (batch). Continúo…`);
          } else {
            console.error('ERROR durante flush del batch:', err);
            throw err;
          }
        }
        process.stdout.write(`\rEscritos: ${count}`);
      }

      // Throttle suave cada N puntos totales para evitar picos y resets
      if (throttleEvery > 0 && count % throttleEvery === 0) {
        await sleep(throttleMs);
      }
    }

    // Flush por archivo: limita el daño si cae la conexión a mitad
    try {
      await safeFlush(`file-${fname}`);
    } catch (err) {
      if (isRetentionError(err)) {
        console.warn(`WARN: Retention en ${fname}. Algunos puntos pueden haberse descartado. Continúo…`);
      } else if (isConnReset(err)) {
        console.warn(`WARN: ECONNRESET tras ${fname}. Se reintentó con nuevo WriteAPI y sigo…`);
      } else {
        console.error(`ERROR: flush en archivo ${fname}:`, err);
        throw err;
      }
    }

    process.stdout.write(`\rEscritos: ${count} (último archivo: ${fname}, filas: ${wroteForFile})`);
  }

  // Cierre final
  await safeFlush('final');
  await safeClose();
  console.log(`\nImportación finalizada. Puntos escritos (intentados): ${count}`);
}

// ───────────────────────────────────────────────────────────────────────────────
const absDir = path.resolve(DATA_DIR);
importFolder(absDir).catch(async (err) => {
  // Si es sólo retención, no es “fatal”, pero aquí llegó algo más fuerte
  console.error('\nFallo no recuperable durante la importación:', err?.body || err);
  try { await safeClose(); } catch {}
  process.exit(1);
});
