function deepClone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function ensureSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width && rect.height) {
    if (canvas.width !== rect.width) {
      canvas.width = rect.width;
    }
    if (canvas.height !== rect.height) {
      canvas.height = rect.height;
    }
  } else {
    canvas.width = canvas.width || 640;
    canvas.height = canvas.height || 320;
  }
}

function drawAxis(ctx, width, height, options = {}) {
  const { left = 36, bottom = 28, top = 12, right = 12 } = options.padding || {};
  const axisColor = options.axisColor || '#cbd5f5';

  ctx.save();
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, height - bottom);
  ctx.lineTo(width - right, height - bottom);
  ctx.stroke();
  ctx.restore();
}

function formatLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().replace('T', ' ').replace(/:00\.000Z$/, 'Z');
}

function getColors(dataset, count) {
  const fallback = '#0f766e';
  if (!dataset) return Array(count).fill(fallback);
  const { backgroundColor } = dataset;
  if (Array.isArray(backgroundColor)) {
    if (!backgroundColor.length) return Array(count).fill(fallback);
    const repeated = [];
    for (let i = 0; i < count; i += 1) {
      repeated.push(backgroundColor[i % backgroundColor.length] || fallback);
    }
    return repeated;
  }
  if (typeof backgroundColor === 'string') {
    return Array(count).fill(backgroundColor);
  }
  return Array(count).fill(fallback);
}

class SimpleChart {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.canvas = ctx.canvas;
    this.config = { type: 'bar', data: { datasets: [] }, options: {} };
    this._bars = [];
    this.setConfig(config);
  }

  setConfig(config = {}) {
    const next = deepClone(config);
    this.config = {
      type: next.type || 'bar',
      data: next.data || { datasets: [] },
      options: next.options || {}
    };
    this.draw();
  }

  update(config) {
    if (config) {
      const merged = {
        type: config.type || this.config.type,
        data: config.data || this.config.data,
        options: config.options || this.config.options
      };
      this.setConfig(merged);
    } else {
      this.draw();
    }
  }

  destroy() {
    const ctx = this.ctx;
    if (ctx && ctx.canvas) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    this.config = { type: 'bar', data: { datasets: [] }, options: {} };
    this._bars = [];
  }

  draw() {
    const { canvas, ctx } = this;
    if (!canvas || !ctx) {
      return;
    }
    ensureSize(canvas);

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    const dataset = this.config.data?.datasets?.[0];
    const points = Array.isArray(dataset?.data) ? dataset.data : [];

    drawAxis(ctx, width, height, this.config.options);

    if (!points.length) {
      this._bars = [];
      return;
    }

    const values = points.map((entry) => {
      if (typeof entry === 'number') {
        return entry;
      }
      if (entry && typeof entry === 'object') {
        return Number.parseFloat(entry.y ?? entry.value ?? entry.v ?? 0);
      }
      return 0;
    });

    const maxValue = Math.max(9, ...values);
    const minValue = Math.min(0, ...values);

    const padding = { left: 36, bottom: 28, top: 12, right: 12, ...(this.config.options?.padding || {}) };
    const chartWidth = Math.max(1, width - padding.left - padding.right);
    const chartHeight = Math.max(1, height - padding.top - padding.bottom);
    const step = chartWidth / points.length;
    const barWidth = Math.max(4, step * 0.6);
    const colors = getColors(dataset, points.length);

    ctx.save();
    ctx.translate(padding.left, padding.top);

    const range = maxValue - minValue || 1;
    const bars = [];

    points.forEach((entry, index) => {
      const value = values[index];
      const normalized = (value - minValue) / range;
      const barHeight = normalized * chartHeight;
      const x = index * step + (step - barWidth) / 2;
      const y = chartHeight - barHeight;
      ctx.fillStyle = colors[index];
      ctx.fillRect(x, y, barWidth, barHeight);
      const label = entry?.x ?? entry?.time ?? index;
      bars.push({
        x: x + padding.left,
        y: y + padding.top,
        width: barWidth,
        height: barHeight,
        value,
        label,
        color: colors[index]
      });
    });

    ctx.restore();
    this._bars = bars;

    ctx.save();
    ctx.fillStyle = this.config.options?.axisLabelColor || '#475569';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const firstLabel = formatLabel(points[0]?.x ?? points[0]?.time);
    const lastLabel = formatLabel(points[points.length - 1]?.x ?? points[points.length - 1]?.time);
    const labelY = height - padding.bottom + 6;

    if (firstLabel) {
      ctx.fillText(firstLabel, padding.left, labelY);
    }
    if (lastLabel && lastLabel !== firstLabel) {
      ctx.fillText(lastLabel, width - padding.right, labelY);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(maxValue.toFixed(1), padding.left - 6, padding.top + 6);
    ctx.textBaseline = 'bottom';
    ctx.fillText(minValue.toFixed(1), padding.left - 6, height - padding.bottom);
    ctx.restore();
  }

  getBars() {
    return this._bars.map((bar) => ({ ...bar }));
  }
}

export default SimpleChart;
