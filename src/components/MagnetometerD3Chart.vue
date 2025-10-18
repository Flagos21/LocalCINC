<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';

const props = defineProps({
  points: {
    type: Array,
    default: () => []
  },
  unit: {
    type: String,
    default: 'nT'
  },
  yLabel: {
    type: String,
    default: 'H (nT)'
  },
  xLabel: {
    type: String,
    default: 'Tiempo'
  },
  tooltipFormatter: {
    type: Function,
    default: null
  }
});

const emit = defineEmits(['update:visible-domain']);

const containerRef = ref();
const svgRef = ref();

const dimensions = {
  height: 420,
  margin: { top: 32, right: 32, bottom: 64, left: 72 }
};

let width = 0;
let svg;
let xAxisGroup;
let yAxisGroup;
let linePath;
let pointsGroup;
let focusCircle;
let overlay;
let tooltip;
let zoomBehavior;
let resizeObserver;
let yLabelElement;
let xLabelElement;
let zeroLine;

const clipPathId = `clip-${Math.random().toString(36).slice(2, 10)}`;

let basePoints = [];
let currentTransform = d3.zoomIdentity;
let effectiveX = xScaleBase.copy();

const xScaleBase = d3.scaleTime();
const yScale = d3.scaleLinear();

const sanitizePoints = (points) => {
  if (!Array.isArray(points)) return [];
  return points
    .filter((point) =>
      point && point.date instanceof Date && !Number.isNaN(point.date.getTime()) && Number.isFinite(point.value)
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
};

const getTimeExtent = (points) => {
  if (!points.length) {
    return null;
  }
  const extent = d3.extent(points, (point) => point.date);
  const [start, end] = extent;
  if (!start || !end) {
    return null;
  }

  if (start.getTime() === end.getTime()) {
    const padding = 30 * 60 * 1000; // 30 minutos a cada lado
    return [new Date(start.getTime() - padding), new Date(end.getTime() + padding)];
  }

  return extent;
};

const getValueExtent = (points) => {
  if (!points.length) {
    return [-1, 1];
  }

  const extent = d3.extent(points, (point) => point.value);
  let [min, max] = extent;
  if (min === undefined || max === undefined) {
    min = 0;
    max = 1;
  }

  if (min === max) {
    const padding = Math.max(Math.abs(min), 1) * 0.1;
    return [min - padding, max + padding];
  }

  const range = max - min;
  const padding = range * 0.1;
  return [min - padding, max + padding];
};

const updateScales = () => {
  const { height, margin } = dimensions;
  xScaleBase.range([margin.left, width - margin.right]);
  yScale.range([height - margin.bottom, margin.top]);

  if (svg) {
    svg.attr('width', width).attr('height', height);
    svg.select(`#${clipPathId}-rect`).attr('x', margin.left).attr('y', margin.top).attr('width', Math.max(0, width - margin.left - margin.right)).attr('height', Math.max(0, height - margin.top - margin.bottom));
    if (xLabelElement) {
      xLabelElement
        .attr('x', margin.left + Math.max(0, width - margin.left - margin.right) / 2)
        .attr('y', height - margin.bottom / 2);
    }
    if (overlay) {
      overlay
        .attr('x', margin.left)
        .attr('y', margin.top)
        .attr('width', Math.max(0, width - margin.left - margin.right))
        .attr('height', Math.max(0, height - margin.top - margin.bottom));
    }
  }

  if (zoomBehavior) {
    const extent = [
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom]
    ];
    zoomBehavior.translateExtent(extent).extent(extent);
  }
};

const renderChart = (transform = currentTransform) => {
  if (!svg || !xAxisGroup || !yAxisGroup) {
    return;
  }

  if (!basePoints.length) {
    linePath?.attr('d', null);
    pointsGroup?.selectAll('circle').remove();
    focusCircle?.attr('display', 'none');
    tooltip?.style('opacity', 0);
    zeroLine?.attr('display', 'none');
    xAxisGroup.call(d3.axisBottom(xScaleBase).ticks(0));
    yAxisGroup.call(d3.axisLeft(yScale).ticks(0));
    emit('update:visible-domain', [null, null]);
    return;
  }

  const { margin } = dimensions;
  effectiveX = transform.rescaleX(xScaleBase);
  const line = d3
    .line()
    .defined((d) => Number.isFinite(d.value))
    .x((d) => effectiveX(d.date))
    .y((d) => yScale(d.value));

  linePath.datum(basePoints).attr('d', line);

  pointsGroup
    .selectAll('circle')
    .data(basePoints)
    .join('circle')
    .attr('class', 'chart-point')
    .attr('r', 3)
    .attr('cx', (d) => effectiveX(d.date))
    .attr('cy', (d) => yScale(d.value));

  const xTicks = Math.min(12, Math.max(4, Math.floor(width / 120)));
  const xAxis = d3.axisBottom(effectiveX).ticks(xTicks).tickFormat(d3.timeFormat('%d/%m %H:%M'));
  xAxisGroup.call(xAxis);

  const yTicks = Math.min(8, Math.max(3, Math.floor(dimensions.height / 70)));
  const yAxis = d3.axisLeft(yScale).ticks(yTicks).tickFormat((value) => d3.format('.2f')(value));
  yAxisGroup.call(yAxis);

  if (zeroLine) {
    const zeroY = yScale(0);
    const isVisible = zeroY >= margin.top && zeroY <= dimensions.height - margin.bottom;
    zeroLine
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', zeroY)
      .attr('y2', zeroY)
      .attr('display', isVisible ? null : 'none');
  }

  emit('update:visible-domain', effectiveX.domain());
};

const applyData = (points) => {
  hideTooltip();
  basePoints = sanitizePoints(points);
  const timeExtent = getTimeExtent(basePoints);
  const valueExtent = getValueExtent(basePoints);

  if (!timeExtent) {
    renderChart();
    return;
  }

  xScaleBase.domain(timeExtent);
  yScale.domain(valueExtent).nice();

  currentTransform = d3.zoomIdentity;
  if (svg && zoomBehavior) {
    svg.call(zoomBehavior.transform, currentTransform);
  } else {
    renderChart(currentTransform);
  }
};

const onZoom = (event) => {
  currentTransform = event.transform;
  renderChart(currentTransform);
};

const formatValue = (value) => {
  if (!Number.isFinite(value)) return '—';
  return `${d3.format('+.2f')(value)} ${props.unit}`;
};

const getTooltipContent = (point) => {
  if (!point) return '';
  if (typeof props.tooltipFormatter === 'function') {
    return props.tooltipFormatter(point, { formatValue, unit: props.unit });
  }

  const dateFormatter = d3.timeFormat('%d/%m/%Y %H:%M');
  return `
    <strong>${dateFormatter(point.date)}</strong>
    <div>${formatValue(point.value)}</div>
  `;
};

const hideTooltip = () => {
  tooltip?.style('opacity', 0);
  focusCircle?.attr('display', 'none');
};

const pointerMove = (event) => {
  if (!basePoints.length || !overlay) {
    hideTooltip();
    return;
  }

  const [pointerX] = d3.pointer(event, svg.node());
  const { margin } = dimensions;
  if (pointerX < margin.left || pointerX > width - margin.right) {
    hideTooltip();
    return;
  }
  const x0 = effectiveX.invert(pointerX);
  const bisect = d3.bisector((d) => d.date).center;
  const index = bisect(basePoints, x0);
  const point = basePoints[index];

  if (!point) {
    hideTooltip();
    return;
  }

  const cx = effectiveX(point.date);
  const cy = yScale(point.value);

  focusCircle
    .attr('display', null)
    .attr('cx', cx)
    .attr('cy', cy);

  if (tooltip) {
    const bounds = containerRef.value?.getBoundingClientRect();
    const tooltipWidth = tooltip.node()?.offsetWidth ?? 0;
    const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const offsetX = bounds ? bounds.left + scrollX : 0;
    const offsetY = bounds ? bounds.top + scrollY : 0;

    const left = Math.min(
      offsetX + cx + 16,
      offsetX + (width - dimensions.margin.right) - tooltipWidth - 12
    );

    tooltip
      .style('opacity', 1)
      .style('left', `${left}px`)
      .style('top', `${offsetY + cy - 24}px`)
      .html(getTooltipContent(point));
  }
};

onMounted(() => {
  svg = d3.select(svgRef.value);
  const { height, margin } = dimensions;

  svg.attr('height', height).attr('width', '100%').style('touch-action', 'none');

  const defs = svg.append('defs');
  defs
    .append('clipPath')
    .attr('id', clipPathId)
    .append('rect')
    .attr('id', `${clipPathId}-rect`)
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', 0)
    .attr('height', Math.max(0, height - margin.top - margin.bottom));

  const root = svg.append('g');

  yAxisGroup = root.append('g').attr('class', 'chart-axis chart-axis--y').attr('transform', `translate(${margin.left}, 0)`);
  xAxisGroup = root
    .append('g')
    .attr('class', 'chart-axis chart-axis--x')
    .attr('transform', `translate(0, ${height - margin.bottom})`);

  const content = root.append('g').attr('clip-path', `url(#${clipPathId})`);
  zeroLine = content.append('line').attr('class', 'chart-zero-line').attr('display', 'none');
  linePath = content.append('path').attr('class', 'chart-line');
  pointsGroup = content.append('g').attr('class', 'chart-points');
  focusCircle = content.append('circle').attr('class', 'chart-focus').attr('r', 5).attr('display', 'none');

  yLabelElement = svg
    .append('text')
    .attr('class', 'chart-axis-label')
    .attr('transform', `rotate(-90)`)
    .attr('x', -(height / 2))
    .attr('y', margin.left - 48)
    .attr('text-anchor', 'middle')
    .text(props.yLabel || `H (${props.unit})`);

  xLabelElement = svg
    .append('text')
    .attr('class', 'chart-axis-label chart-axis-label--x')
    .attr('x', margin.left + (width - margin.left - margin.right) / 2)
    .attr('y', height - 20)
    .attr('text-anchor', 'middle')
    .text(props.xLabel);

  zoomBehavior = d3.zoom().scaleExtent([1, 80]).on('zoom', onZoom);
  svg.call(zoomBehavior).on('dblclick.zoom', null);

  const updateFromResize = () => {
    width = containerRef.value?.clientWidth ?? 960;
    updateScales();
    renderChart(currentTransform);
  };

  updateFromResize();

  resizeObserver = new ResizeObserver(() => {
    updateFromResize();
  });

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
    tooltip = d3
      .select(containerRef.value)
      .append('div')
      .attr('class', 'chart-tooltip')
      .style('opacity', 0);
  }

  overlay = root
    .append('rect')
    .attr('class', 'chart-overlay')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', Math.max(0, width - margin.left - margin.right))
    .attr('height', Math.max(0, height - margin.top - margin.bottom))
    .on('pointerenter pointermove', pointerMove)
    .on('pointerleave', hideTooltip)
    .on('touchstart', (event) => event.preventDefault());
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  tooltip?.remove();
});

watch(
  () => props.yLabel,
  (label) => {
    if (yLabelElement) {
      yLabelElement.text(label || `H (${props.unit})`);
    }
  },
  { immediate: true }
);

watch(
  () => props.unit,
  (unit) => {
    if (!props.yLabel && yLabelElement) {
      yLabelElement.text(`H (${unit})`);
    }
  }
);

watch(
  () => props.xLabel,
  (label) => {
    if (xLabelElement) {
      xLabelElement.text(label);
    }
  },
  { immediate: true }
);

watch(
  () => props.points,
  (points) => {
    applyData(points);
  },
  { immediate: true }
);

const resetZoom = () => {
  if (!svg || !zoomBehavior) return;
  svg.transition().duration(250).call(zoomBehavior.transform, d3.zoomIdentity);
};

defineExpose({
  resetZoom
});
</script>

<template>
  <div ref="containerRef" class="magnetometer-chart">
    <svg ref="svgRef" class="magnetometer-chart__svg" role="img" aria-label="Serie temporal de la componente H" />
  </div>
</template>

<style scoped>
.magnetometer-chart {
  width: 100%;
  height: 100%;
  position: relative;
}

.magnetometer-chart__svg {
  width: 100%;
  height: 100%;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.8) 0%, rgba(248, 250, 252, 0.2) 100%);
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  overflow: visible;
}


.chart-line {
  fill: none;
  stroke: #1d4ed8;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.chart-point {
  fill: #1d4ed8;
  stroke: #f8fafc;
  stroke-width: 1.5;
  pointer-events: none;
}

.chart-focus {
  fill: #f97316;
  stroke: #fff;
  stroke-width: 2;
  pointer-events: none;
}

.chart-zero-line {
  stroke: rgba(15, 23, 42, 0.25);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  pointer-events: none;
}

.chart-overlay {
  fill: transparent;
  cursor: crosshair;
}

.chart-axis :deep(.domain) {
  stroke: rgba(148, 163, 184, 0.45);
}

.chart-axis :deep(.tick line) {
  stroke: rgba(148, 163, 184, 0.35);
}

.chart-axis :deep(.tick text) {
  fill: #475569;
  font-size: 0.75rem;
}

.chart-axis-label {
  fill: #1f2933;
  font-size: 0.9rem;
  font-weight: 600;
}

.chart-axis-label--x {
  dominant-baseline: hanging;
}

.chart-tooltip {
  position: absolute;
  min-width: 12rem;
  max-width: 16rem;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
  transform: translateY(-50%);
  transition: opacity 120ms ease;
  font-size: 0.8125rem;
  line-height: 1.2;
}

.chart-tooltip strong {
  display: block;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
</style>
