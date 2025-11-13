import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function isImageFile(name) {
  const ext = path.extname(name).toLowerCase();
  return imageExtensions.has(ext);
}

function buildImagePayload({ year, month, day, filename }) {
  const baseName = path.parse(filename).name;
  const [datePart, timePart] = baseName.split('_');
  const safeTime =
    timePart && timePart.length === 6
      ? `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}`
      : null;
  const isoTimestamp =
    datePart && timePart && timePart.length === 6
      ? new Date(
          `${year}-${month}-${day}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}Z`
        ).toISOString()
      : null;

  return {
    filename,
    url: `/api/ionograms/${year}/${month}/${day}/${filename}`,
    date: `${year}-${month}-${day}`,
    time: safeTime,
    timestamp: isoTimestamp
  };
}

async function listIonogramsForDate(dateStr, ionogramRoot) {
  const [year, month, day] = dateStr.split('-');
  const dayDir = path.join(ionogramRoot, year, month, day);

  try {
    const entries = await fs.readdir(dayDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isImageFile(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .map((filename) => buildImagePayload({ year, month, day, filename }));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function findLatestIonogram(ionogramRoot) {
  try {
    const years = await fs.readdir(ionogramRoot, { withFileTypes: true });
    const sortedYears = years
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));

    for (const year of sortedYears) {
      const months = await fs.readdir(path.join(ionogramRoot, year), { withFileTypes: true });
      const sortedMonths = months
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a));

      for (const month of sortedMonths) {
        const days = await fs.readdir(path.join(ionogramRoot, year, month), { withFileTypes: true });
        const sortedDays = days
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort((a, b) => b.localeCompare(a));

        for (const day of sortedDays) {
          const files = await fs.readdir(path.join(ionogramRoot, year, month, day), { withFileTypes: true });
          const sortedFiles = files
            .filter((entry) => entry.isFile() && isImageFile(entry.name))
            .map((entry) => entry.name)
            .sort((a, b) => b.localeCompare(a));

          if (sortedFiles.length > 0) {
            return buildImagePayload({ year, month, day, filename: sortedFiles[0] });
          }
        }
      }
    }

    return null;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function createIonogramRouter({ ionogramRoot }) {
  const router = express.Router();

  router.get('/latest', async (req, res) => {
    try {
      const latest = await findLatestIonogram(ionogramRoot);
      if (!latest) {
        res.status(404).json({ error: 'No se encontraron ionogramas.' });
        return;
      }
      res.json(latest);
    } catch (err) {
      console.error('API /api/ionograms/latest error:', err);
      res.status(500).json({ error: 'No se pudo obtener el ionograma más reciente.' });
    }
  });

  router.get('/list', async (req, res) => {
    const dateParam = req.query.date?.toString();

    if (!dateParam) {
      res.status(400).json({ error: 'Parámetro date requerido (YYYY-MM-DD).' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      res.status(400).json({ error: 'Formato de fecha inválido. Usa YYYY-MM-DD.' });
      return;
    }

    try {
      const images = await listIonogramsForDate(dateParam, ionogramRoot);
      res.json({ date: dateParam, images });
    } catch (err) {
      console.error('API /api/ionograms/list error:', err);
      res.status(500).json({ error: 'No se pudieron listar los ionogramas para la fecha dada.' });
    }
  });

  router.use(express.static(ionogramRoot, { fallthrough: true }));

  return router;
}

export default createIonogramRouter;
