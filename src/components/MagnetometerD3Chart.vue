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
let areaPath;
let zoomBehavior;
let resizeObserver;
let yLabel;

const clipPathId = `clip-${Math.random().toString(36).slice(2, 10)}`;

let basePoints = [];
let currentTransform = d3.zoomIdentity;

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
    areaPath?.attr('d', null);
    xAxisGroup.call(d3.axisBottom(xScaleBase).ticks(0));
    yAxisGroup.call(d3.axisLeft(yScale).ticks(0));
    emit('update:visible-domain', [null, null]);
    return;
  }

  const effectiveX = transform.rescaleX(xScaleBase);
  const line = d3
    .line()
    .defined((d) => Number.isFinite(d.value))
    .x((d) => effectiveX(d.date))
    .y((d) => yScale(d.value));

  const area = d3
    .area()
    .defined(line.defined())
    .x((d) => effectiveX(d.date))
    .y0(yScale.range()[0])
    .y1((d) => yScale(d.value));

  linePath.datum(basePoints).attr('d', line);
  areaPath.datum(basePoints).attr('d', area);

  const xTicks = Math.min(12, Math.max(4, Math.floor(width / 120)));
  const xAxis = d3.axisBottom(effectiveX).ticks(xTicks).tickFormat(d3.timeFormat('%d/%m %H:%M'));
  xAxisGroup.call(xAxis);

  const yTicks = Math.min(8, Math.max(3, Math.floor(dimensions.height / 70)));
  const yAxis = d3.axisLeft(yScale).ticks(yTicks).tickFormat((value) => d3.format('.2f')(value));
  yAxisGroup.call(yAxis);

  emit('update:visible-domain', effectiveX.domain());
};

const applyData = (points) => {
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
  areaPath = content.append('path').attr('class', 'chart-area');
  linePath = content.append('path').attr('class', 'chart-line');

  yLabel = svg
    .append('text')
    .attr('class', 'chart-axis-label')
    .attr('transform', `rotate(-90)`)
    .attr('x', -(height / 2))
    .attr('y', margin.left - 48)
    .attr('text-anchor', 'middle')
    .text(`H (${props.unit})`);

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
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

watch(
  () => props.unit,
  (unit) => {
    if (yLabel) {
      yLabel.text(`H (${unit})`);
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
  stroke: #2563eb;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.chart-area {
  fill: rgba(37, 99, 235, 0.12);
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
</style>
