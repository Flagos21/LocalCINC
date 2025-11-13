import express from 'express';
import {
  getDstRealtime,
  getDstRealtimeLatest,
  isDstEnabled
} from '../services/dstService.js';

function createDstRouter() {
  const router = express.Router();

  async function ensureDstEnabled(res) {
    if (!isDstEnabled()) {
      res.status(503).json({ error: 'Dst disabled' });
      return false;
    }
    return true;
  }

  router.get('/chart', async (req, res) => {
    try {
      if (!(await ensureDstEnabled(res))) {
        return;
      }
      const data = await getDstRealtime();
      res.json(data);
    } catch (err) {
      console.error('API /api/dst/chart error:', err);
      res.status(502).json({ error: String(err.message || err) });
    }
  });

  router.get('/realtime', async (req, res) => {
    try {
      if (!(await ensureDstEnabled(res))) {
        return;
      }
      const data = await getDstRealtime();
      res.json(data);
    } catch (err) {
      console.error('API /api/dst/realtime error:', err);
      res.status(502).json({ error: String(err.message || err) });
    }
  });

  router.get('/realtime/latest', async (req, res) => {
    try {
      if (!(await ensureDstEnabled(res))) {
        return;
      }
      const latest = await getDstRealtimeLatest();
      if (!latest) {
        res.status(404).json({ error: 'No hay datos Dst disponibles.' });
        return;
      }
      res.json(latest);
    } catch (err) {
      console.error('API /api/dst/realtime/latest error:', err);
      res.status(502).json({ error: String(err.message || err) });
    }
  });

  return router;
}

export default createDstRouter;
