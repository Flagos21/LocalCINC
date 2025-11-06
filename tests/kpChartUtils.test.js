import test from 'node:test';
import assert from 'node:assert/strict';

import {
  colorForKp,
  normalizeKpSeries,
  buildKpDataset,
  mergeKpSeries,
  formatUpdatedAt
} from '../src/utils/kpChartUtils.js';

test('colorForKp aplica umbrales', () => {
  assert.equal(colorForKp(3.9), '#22c55e');
  assert.equal(colorForKp(4), '#facc15');
  assert.equal(colorForKp(5.9), '#facc15');
  assert.equal(colorForKp(6), '#ef4444');
  assert.equal(colorForKp('no-number'), '#64748b');
});

test('normalizeKpSeries ordena y deduplica por timestamp', () => {
  const series = [
    { time: '2025-11-06T03:00:00Z', value: 4.5, status: 'def' },
    { time: '2025-11-06T00:00:00Z', value: 3, status: 'now' },
    { time: '2025-11-06T03:00:00Z', value: 5, status: 'nowcast' }
  ];
  const normalized = normalizeKpSeries(series);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized[0], { time: '2025-11-06T00:00:00.000Z', value: 3, status: 'now' });
  assert.deepEqual(normalized[1], { time: '2025-11-06T03:00:00.000Z', value: 5, status: 'now' });
});

test('buildKpDataset genera dataset con colores por punto', () => {
  const input = [
    { time: '2025-11-06T00:00:00Z', value: 3.5 },
    { time: '2025-11-06T03:00:00Z', value: 4.2 },
    { time: '2025-11-06T06:00:00Z', value: 6.1 }
  ];
  const dataset = buildKpDataset(input);
  assert.equal(dataset.label, 'Índice Kp');
  assert.equal(dataset.data.length, 3);
  assert.deepEqual(dataset.backgroundColor, ['#22c55e', '#facc15', '#ef4444']);
});

test('mergeKpSeries combina series previas y nuevas', () => {
  const prev = [
    { time: '2025-11-06T00:00:00Z', value: 3 },
    { time: '2025-11-06T03:00:00Z', value: 4 }
  ];
  const next = [
    { time: '2025-11-06T03:00:00Z', value: 5 },
    { time: '2025-11-06T06:00:00Z', value: 6 }
  ];
  const merged = mergeKpSeries(prev, next);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].value, 5);
  assert.equal(merged[2].time, '2025-11-06T06:00:00.000Z');
});

test('formatUpdatedAt devuelve etiqueta legible', () => {
  const formatted = formatUpdatedAt('2025-11-06T12:00:00Z');
  assert.match(formatted, /2025/);
  assert.ok(formatted.endsWith('UTC'));
  assert.equal(formatUpdatedAt(null), '—');
});
