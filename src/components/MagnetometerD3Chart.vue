<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';

const props = defineProps({
  series: {
    type: Array,
    default: () => []
  },
  unit: {
    type: String,
    default: 'nT'
  },
  yLabel: {
    type: String,
    default: 'Valor (nT)'
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
let linesGroup;
let pointsGroup;
let focusGroup;
let overlay;
let tooltip;
let zoomBehavior;
let resizeObserver;
let yLabelElement;
let xLabelElement;
let zeroLine;
let gridGroup;

const clipPathId = `clip-${Math.random().toString(36).slice(2, 10)}`;
const MS_IN_DAY = 1000 * 60 * 60 * 24;

const DEFAULT_COLORS = ['#2563eb', '#f97316', '#14b8a6', '#8b5cf6', '#f973ab', '#facc15'];

const xScaleBase = d3.scaleTime();
const yScale = d3.scaleLinear();

let baseSeries = [];
let primarySeries = null;
let timePoints = [];
let currentTransform = d3.zoomIdentity;
let effectiveX = xScaleBase.copy();

const sanitizeSeries = (series) => {
  if (!Array.isArray(series)) return [];

  return series
    .map((serie, index) => {
      const rawPoints = Array.isArray(serie?.points) ? serie.points : [];
      const sanitizedPoints = rawPoints
        .filter(
          (point) =>
            point && point.date instanceof Date && !Number.isNaN(point.date.getTime()) && Number.isFinite(point.value)
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((point) => ({ ...point }));

      if (!sanitizedPoints.length) {
        return null;
      }

      const color = serie?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      const id = serie?.id ?? `serie-${index}`;
      const name = serie?.name ?? `Serie ${index + 1}`;

      return {
        id,
        name,
        color,
        points: sanitizedPoints
      };
    })
    .filter(Boolean);
};

const computeUnifiedTimes = (series) => {
  const times = new Set();
  series.forEach((serie) => {
    serie.points.forEach((point) => {
      times.add(point.date.getTime());
    });
  });

  return Array.from(times)
    .sort((a, b) => a - b)
    .map((timestamp) => new Date(timestamp));
};

const getTimeExtentFromSeries = (series) => {
  if (!series.length) return null;

  const allDates = series.flatMap((serie) => serie.points.map((point) => point.date));
  if (!allDates.length) return null;

  const extent = d3.extent(allDates);
  const [start, end] = extent;

  if (!start || !end) return null;

  if (start.getTime() === end.getTime()) {
    const padding = 30 * 60 * 1000;
    return [new Date(start.getTime() - padding), new Date(end.getTime() + padding)];
  }

  return extent;
};

const getValueExtentFromSeries = (series) => {
  if (!series.length) return [-1, 1];

  const allValues = series.flatMap((serie) => serie.points.map((point) => point.value));
  if (!allValues.length) return [-1, 1];

  const extent = d3.extent(allValues);
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

const createTimeTickConfig = (start, end) => {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return null;
  }

  const totalDays = Math.max(0, (end.getTime() - start.getTime()) / MS_IN_DAY);

  if (totalDays >= 365 * 4) {
    return {
      interval: d3.timeMonth.every(2),
      format: d3.timeFormat('%b %Y')
    };
  }

  if (totalDays >= 365) {
    return {
      interval: d3.timeMonth.every(1),
      format: d3.timeFormat('%b %Y')
    };
  }

  if (totalDays >= 120) {
    return {
      interval: d3.timeWeek.every(2),
      format: d3.timeFormat('%d %b %Y')
    };
  }

  if (totalDays >= 30) {
    return {
      interval: d3.timeWeek.every(1),
      format: d3.timeFormat('%d %b')
    };
  }

  if (totalDays >= 10) {
    return {
      interval: d3.timeDay.every(2),
      format: d3.timeFormat('%d %b')
    };
  }

  if (totalDays >= 2) {
    return {
      interval: d3.timeDay.every(1),
      format: d3.timeFormat('%d %b')
    };
  }

  if (totalDays >= 1) {
    return {
      interval: d3.timeHour.every(6),
      format: d3.timeFormat('%d %b %H:%M')
    };
  }

  return {
    interval: d3.timeHour.every(1),
    format: d3.timeFormat('%H:%M')
  };
};

const updateScales = () => {
  const { height, margin } = dimensions;
  xScaleBase.range([margin.left, width - margin.right]);
  yScale.range([height - margin.bottom, margin.top]);

  if (svg) {
    svg.attr('width', width).attr('height', height);
    svg
      .select(`#${clipPathId}-rect`)
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', Math.max(0, width - margin.left - margin.right))
      .attr('height', Math.max(0, height - margin.top - margin.bottom));
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

  const { margin } = dimensions;

  if (!baseSeries.length) {
    linesGroup?.selectAll('.chart-line').remove();
    pointsGroup?.selectAll('.chart-points-series').remove();
    focusGroup?.selectAll('circle').remove();
    tooltip?.style('opacity', 0);
    zeroLine?.attr('display', 'none');
    gridGroup?.selectAll('line').remove();
    xAxisGroup.call(d3.axisBottom(xScaleBase).ticks(0));
    yAxisGroup.call(d3.axisLeft(yScale).ticks(0));
    emit('update:visible-domain', [null, null]);
    return;
  }

  effectiveX = transform.rescaleX(xScaleBase);

  const lineGenerator = d3
    .line()
    .defined((point) => Number.isFinite(point.value))
    .x((point) => effectiveX(point.date))
    .y((point) => yScale(point.value));

  const lines = linesGroup.selectAll('.chart-line').data(baseSeries, (serie) => serie.id);

  lines
    .join(
      (enter) =>
        enter
          .append('path')
          .attr('class', 'chart-line')
          .attr('stroke', (serie) => serie.color),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr('d', (serie) => lineGenerator(serie.points));

  const seriesPoints = pointsGroup.selectAll('.chart-points-series').data(baseSeries, (serie) => serie.id);

  seriesPoints.exit().remove();

  seriesPoints
    .join((enter) => enter.append('g').attr('class', 'chart-points-series'), (update) => update)
    .each(function (serie) {
      const selection = d3
        .select(this)
        .selectAll('circle')
        .data(serie.points, (point) => point.date.getTime());

      selection
        .join(
          (enter) =>
            enter
              .append('circle')
              .attr('class', 'chart-point')
              .attr('r', 3),
          (update) => update,
          (exit) => exit.remove()
        )
        .attr('fill', serie.color)
        .attr('stroke', () => {
          const color = d3.color(serie.color) ?? d3.color('#ffffff');
          return color ? color.brighter(1.5).formatHex() : '#ffffff';
        })
        .attr('cx', (point) => effectiveX(point.date))
        .attr('cy', (point) => yScale(point.value));
    });

  const focusSelection = focusGroup.selectAll('circle').data(baseSeries, (serie) => serie.id);

  focusSelection
    .join(
      (enter) =>
        enter
          .append('circle')
          .attr('class', 'chart-focus')
          .attr('r', 5)
          .attr('display', 'none'),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr('fill', (serie) => serie.color);

  const [domainStart, domainEnd] = effectiveX.domain();
  const tickConfig = createTimeTickConfig(domainStart, domainEnd);
  let xAxis = d3.axisBottom(effectiveX);
  let xTickValuesList;

  if (tickConfig) {
    xAxis = xAxis.ticks(tickConfig.interval).tickFormat(tickConfig.format);
    xTickValuesList = effectiveX.ticks(tickConfig.interval);
  } else {
    const fallbackTicks = Math.min(12, Math.max(4, Math.floor(width / 120)));
    xAxis = xAxis.ticks(fallbackTicks);
    xTickValuesList = effectiveX.ticks(fallbackTicks);
  }

  xAxisGroup.call(xAxis);

  const yTicks = Math.min(8, Math.max(3, Math.floor(dimensions.height / 70)));
  const [yMin, yMax] = yScale.domain();
  const hasLargeValues = Math.max(Math.abs(yMin ?? 0), Math.abs(yMax ?? 0)) >= 100;
  const yFormatter = hasLargeValues ? d3.format(',.0f') : d3.format(',.2f');
  const yAxis = d3.axisLeft(yScale).ticks(yTicks).tickFormat((value) => yFormatter(value));
  yAxisGroup.call(yAxis);

  if (gridGroup) {
    const innerWidth = Math.max(0, width - margin.left - margin.right);
    const innerHeight = Math.max(0, dimensions.height - margin.top - margin.bottom);
    const yTickValues = yScale.ticks(yTicks);

    gridGroup
      .selectAll('.grid-line--y')
      .data(yTickValues)
      .join('line')
      .attr('class', 'grid-line grid-line--y')
      .attr('x1', margin.left)
      .attr('x2', margin.left + innerWidth)
      .attr('y1', (value) => yScale(value))
      .attr('y2', (value) => yScale(value));

    gridGroup
      .selectAll('.grid-line--x')
      .data(xTickValuesList ?? [])
      .join('line')
      .attr('class', 'grid-line grid-line--x')
      .attr('y1', margin.top)
      .attr('y2', margin.top + innerHeight)
      .attr('x1', (value) => effectiveX(value))
      .attr('x2', (value) => effectiveX(value));
  }

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

const applyData = (series) => {
  hideTooltip();
  baseSeries = sanitizeSeries(series);

  if (!baseSeries.length) {
    primarySeries = null;
    timePoints = [];
    renderChart();
    return;
  }

  primarySeries = baseSeries.reduce((acc, serie) => {
    if (!acc) return serie;
    return serie.points.length > acc.points.length ? serie : acc;
  }, null);

  timePoints = computeUnifiedTimes(baseSeries);

  const timeExtent = getTimeExtentFromSeries(baseSeries);
  const valueExtent = getValueExtentFromSeries(baseSeries);

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

const getTooltipContent = (payload) => {
  if (!payload || !payload.entries?.length) return '';

  if (typeof props.tooltipFormatter === 'function') {
    return props.tooltipFormatter(payload, { formatValue, unit: props.unit });
  }

  const dateFormatter = d3.timeFormat('%d/%m/%Y %H:%M');
  const items = payload.entries
    .map(
      ({ series, point }) => `
        <div class="chart-tooltip__item">
          <span class="chart-tooltip__indicator" style="background:${series.color}"></span>
          <span>${series.name}: ${formatValue(point.value)}</span>
        </div>
      `
    )
    .join('');

  return `
    <strong>${dateFormatter(payload.date)}</strong>
    ${items}
  `;
};

const hideTooltip = () => {
  tooltip?.style('opacity', 0);
  focusGroup?.selectAll('circle').attr('display', 'none');
};

const pointerMove = (event) => {
  if (!baseSeries.length || !overlay || !primarySeries || !timePoints.length) {
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
  const bisectTime = d3.bisector((date) => date.getTime()).center;
  const index = bisectTime(timePoints, x0);
  const targetDate = timePoints[index];

  if (!targetDate) {
    hideTooltip();
    return;
  }

  const entries = baseSeries
    .map((serie) => {
      const bisectSerie = d3.bisector((point) => point.date).center;
      const pointIndex = bisectSerie(serie.points, targetDate);
      const candidate = serie.points[pointIndex];
      if (!candidate) return null;

      const neighbours = [
        candidate,
        serie.points[Math.max(0, pointIndex - 1)],
        serie.points[Math.min(serie.points.length - 1, pointIndex + 1)]
      ].filter(Boolean);

      const { point } = neighbours.reduce(
        (acc, current) => {
          const diff = Math.abs(current.date.getTime() - targetDate.getTime());
          if (diff < acc.diff) {
            return { diff, point: current };
          }
          return acc;
        },
        { diff: Number.POSITIVE_INFINITY, point: candidate }
      );

      return { series: serie, point };
    })
    .filter(Boolean);

  if (!entries.length) {
    hideTooltip();
    return;
  }

  const entriesMap = new Map(entries.map((entry) => [entry.series.id, entry]));
  const primaryEntry = entriesMap.get(primarySeries.id) ?? entries[0];

  focusGroup
    .selectAll('circle')
    .each(function (serie) {
      const entry = entriesMap.get(serie.id);
      const selection = d3.select(this);
      if (!entry) {
        selection.attr('display', 'none');
        return;
      }
      selection
        .attr('display', null)
        .attr('cx', effectiveX(entry.point.date))
        .attr('cy', yScale(entry.point.value));
    });

  if (!tooltip || !primaryEntry) {
    return;
  }

  const bounds = containerRef.value?.getBoundingClientRect();
  const tooltipWidth = tooltip.node()?.offsetWidth ?? 0;
  const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
  const offsetX = bounds ? bounds.left + scrollX : 0;
  const offsetY = bounds ? bounds.top + scrollY : 0;

  const cx = effectiveX(primaryEntry.point.date);
  const cy = yScale(primaryEntry.point.value);

  const left = Math.min(
    offsetX + cx + 16,
    offsetX + (width - dimensions.margin.right) - tooltipWidth - 12
  );

  const content = getTooltipContent({ date: primaryEntry.point.date, entries });

  if (!content) {
    hideTooltip();
    return;
  }

  tooltip
    .style('opacity', 1)
    .style('left', `${left}px`)
    .style('top', `${offsetY + cy - 24}px`)
    .html(content);
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
  gridGroup = content.append('g').attr('class', 'chart-grid');
  zeroLine = content.append('line').attr('class', 'chart-zero-line').attr('display', 'none');
  linesGroup = content.append('g').attr('class', 'chart-lines');
  pointsGroup = content.append('g').attr('class', 'chart-points');
  focusGroup = content.append('g').attr('class', 'chart-focus-group');

  yLabelElement = svg
    .append('text')
    .attr('class', 'chart-axis-label')
    .attr('transform', `rotate(-90)`)
    .attr('x', -(height / 2))
    .attr('y', margin.left - 48)
    .attr('text-anchor', 'middle')
    .text(props.yLabel || `Valor (${props.unit})`);

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
      yLabelElement.text(label || `Valor (${props.unit})`);
    }
  },
  { immediate: true }
);

watch(
  () => props.unit,
  (unit) => {
    if (!props.yLabel && yLabelElement) {
      yLabelElement.text(`Valor (${unit})`);
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
  () => props.series,
  (series) => {
    applyData(series);
  },
  { immediate: true, deep: true }
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
    <svg
      ref="svgRef"
      class="magnetometer-chart__svg"
      role="img"
      aria-label="Serie temporal de las componentes magnéticas"
    />
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
  background-color: #f8fafc;
  background-image: linear-gradient(180deg, rgba(255, 255, 255, 1) 0%, rgba(241, 245, 249, 0.85) 65%, rgba(226, 232, 240, 0.8) 100%);
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  overflow: visible;
}

.chart-grid line {
  stroke: rgba(148, 163, 184, 0.25);
  stroke-width: 1;
}

.chart-line {
  fill: none;
  stroke-width: 3;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.chart-point {
  stroke-width: 1.5;
  pointer-events: none;
}

.chart-focus {
  stroke: #ffffff;
  stroke-width: 2.5;
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
  fill: #1f2933;
  font-size: 0.8rem;
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
  max-width: 18rem;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
  transform: translateY(-50%);
  transition: opacity 120ms ease;
  font-size: 0.8125rem;
  line-height: 1.25;
}

.chart-tooltip strong {
  display: block;
  font-weight: 600;
  margin-bottom: 0.35rem;
}

.chart-tooltip__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.chart-tooltip__indicator {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.chart-tooltip__item-content {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.chart-tooltip small {
  display: block;
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.8);
}
</style>
