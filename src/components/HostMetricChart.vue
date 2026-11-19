<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatDateTime } from '@/utils/datetime'
import { formatMetric, formatRate, rateUnit } from '@/utils/hostMetrics'

const props = defineProps({
  title: { type: String, required: true },
  series: { type: Array, required: true },
  tooltipFields: { type: Array, default: null },
  capacity: { type: Array, default: null },
  unit: { type: String, default: '%' },
  fillOpacity: { type: Number, required: true },
  emptyText: { type: String, default: '暂无数据' },
  sample: { type: Object, default: null },
  history: { type: Array, required: true },
  windowEnd: { type: Number, required: true },
  range: { type: Object, required: true },
})

const plot = ref(null)
const width = ref(360)
const selectedTime = ref(null)
const selectionMode = ref(null)
const top = 10
const bottom = 134
const left = 65
const right = computed(() => width.value - 18)
const sampleGap = computed(() => props.range.intervalMs * 1.5)
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const day = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' })
let observer

onMounted(() => {
  if (!plot.value) return
  observer = new ResizeObserver(([entry]) => { width.value = Math.max(196, Math.round(entry.contentRect.width)) })
  observer.observe(plot.value)
  document.addEventListener('pointerdown', clearOutside, true)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('pointerdown', clearOutside, true)
})

const start = computed(() => props.windowEnd - props.range.durationMs)
const showTickDate = computed(() => !props.range.dateAxis && new Date(start.value).toDateString() !== new Date(props.windowEnd).toDateString())
const height = computed(() => showTickDate.value ? 176 : 160)
const points = computed(() => props.history.map(sample => ({ time: Date.parse(sample.collectedAt), sample }))
  .filter(point => point.time >= start.value && point.time <= props.windowEnd))
const peak = computed(() => Math.max(0, ...points.value.flatMap(({ sample }) =>
  props.series.map(({ key }) => sample[key]).filter(Number.isFinite))))
const isRate = computed(() => props.unit === 'B/s')
const axisUnit = computed(() => isRate.value ? rateUnit(peak.value) : { label: props.unit, divisor: 1 })
const yStep = computed(() => {
  const step = peak.value / axisUnit.value.divisor / 4
  const magnitude = Math.max(props.unit === '%' ? 1 : 0.01, 10 ** Math.floor(Math.log10(step)))
  return Math.max(1, Math.ceil(step / magnitude)) * magnitude
})
const yTicks = computed(() => [0, 1, 2, 3, 4].map(index => index * yStep.value * axisUnit.value.divisor))
const xTicks = computed(() => [0, 1, 2, 3, 4].map(index => start.value + index * props.range.durationMs / 4))
const scaleX = time => left + (time - start.value) / props.range.durationMs * (right.value - left)
const scaleY = value => bottom - value / yTicks.value.at(-1) * (bottom - top)
const formatValue = value => isRate.value ? formatRate(value) : formatMetric(value, props.unit)
const formatTick = value => formatMetric(value / axisUnit.value.divisor, axisUnit.value.label)
const capacityText = computed(() => props.capacity?.map(key => formatMetric(props.sample?.[key])).join(' / '))

function segmentShape(points) {
  const first = points[0]
  if (points.length === 1) return { point: first }
  let previous = first
  let path = `M ${first.x} ${first.y}`
  for (const point of points.slice(1)) {
    // Keep control points between samples so the curve reaches each recorded peak without overshoot.
    const middleX = (previous.x + point.x) / 2
    path += ` C ${middleX} ${previous.y} ${middleX} ${point.y} ${point.x} ${point.y}`
    previous = point
  }
  return { path, area: `${path} L ${previous.x} ${bottom} H ${first.x} Z` }
}

const lines = computed(() => props.series.map(series => {
  const segments = []
  let segment = []
  let previous = null
  for (const { time, sample } of points.value) {
    const value = sample[series.key]
    if (!Number.isFinite(value) || (previous !== null && time - previous > sampleGap.value)) {
      segment = []
      previous = null
    }
    if (!Number.isFinite(value)) continue
    if (!segment.length) segments.push(segment)
    segment.push({ x: scaleX(time), y: scaleY(value) })
    previous = time
  }
  return { ...series, segments: segments.map(segmentShape) }
}))
const hasValues = computed(() => lines.value.some(line => line.segments.length > 0))
const active = computed(() => points.value.find(point => point.time === selectedTime.value))
const tooltipStyle = computed(() => {
  if (!active.value || selectionMode.value === 'touch') return undefined
  const tooltipWidth = Math.min(width.value, props.tooltipFields ? 220 : 174)
  const x = scaleX(active.value.time)
  const position = x + 10 + tooltipWidth <= width.value ? x + 10 : Math.max(0, x - tooltipWidth - 10)
  return { left: `${position}px`, width: `${tooltipWidth}px` }
})

function tooltipValue({ key, unit, totalKey }) {
  const sample = active.value.sample
  if (!totalKey) return unit ? formatMetric(sample[key], unit) : formatValue(sample[key])
  const used = formatMetric(sample[key])
  const total = formatMetric(sample[totalKey])
  return `${used} / ${total}${Number.isFinite(sample[key]) || Number.isFinite(sample[totalKey]) ? ` ${unit}` : ''}`
}

function clearSelection() {
  selectedTime.value = null
  selectionMode.value = null
}

function clearOutside(event) {
  if (selectedTime.value !== null && !plot.value?.contains(event.target)) clearSelection()
}

function selectAt(event) {
  if (!hasValues.value) return
  const bounds = event.currentTarget.getBoundingClientRect()
  const position = (event.clientX - bounds.left) * width.value / bounds.width
  const time = start.value + (position - left) / (right.value - left) * props.range.durationMs
  const closest = points.value.reduce((nearest, point) => !nearest || Math.abs(point.time - time) < Math.abs(nearest.time - time) ? point : nearest, null)
  selectedTime.value = closest && Math.abs(closest.time - time) <= sampleGap.value / 2 ? closest.time : null
  // Touch can emit pointerleave and move focus after pointerdown. Keep the tapped sample until the next touch.
  selectionMode.value = event.pointerType === 'touch' ? 'touch' : 'hover'
}

function moveSelection(direction) {
  const index = points.value.findIndex(point => point.time === selectedTime.value)
  const next = index < 0 ? points.value.length - 1 : Math.max(0, Math.min(points.value.length - 1, index + direction))
  selectedTime.value = points.value[next]?.time ?? null
  selectionMode.value = 'keyboard'
}
</script>

<template>
  <article class="metric-card" :aria-label="title">
    <header class="metric-heading">
      <h2>{{ title }}</h2>
      <div v-if="capacity" class="metric-current"><span>已用 / 总量</span><strong>{{ capacityText }} GiB</strong></div>
      <template v-else>
        <div v-for="line in lines" :key="line.key" class="metric-current">
          <span><i class="series-mark" :style="{ color: line.color }" />{{ line.label }}</span>
          <strong>{{ formatValue(sample?.[line.key]) }}</strong>
        </div>
      </template>
    </header>
    <div v-if="$slots.controls || capacity" class="metric-controls">
      <slot name="controls" />
      <div v-if="capacity" class="metric-legend">
        <span v-for="line in lines" :key="line.key"><i class="series-mark" :style="{ color: line.color }" />{{ line.label }}</span>
        <span class="legend-unit">{{ axisUnit.label }}</span>
      </div>
    </div>
    <div ref="plot" class="metric-plot">
      <div class="metric-trend" role="group" :aria-label="`${title}${range.label}趋势`" :tabindex="hasValues ? 0 : undefined"
        @focus="selectionMode === null && moveSelection(0)" @blur="selectionMode !== 'touch' && clearSelection()"
        @keydown.left.prevent="moveSelection(-1)" @keydown.right.prevent="moveSelection(1)" @keydown.esc.prevent="clearSelection">
        <svg :viewBox="`0 0 ${width} ${height}`" :height="height" width="100%" aria-hidden="true"
          @pointermove="event => event.pointerType !== 'touch' && selectAt(event)"
          @pointerdown="event => event.isPrimary && event.button === 0 && selectAt(event)"
          @pointerleave="selectionMode === 'hover' && clearSelection()" @pointercancel="clearSelection">
          <g v-for="value in (hasValues ? yTicks : [])" :key="value" class="axis">
            <line :x1="left" :x2="right" :y1="scaleY(value)" :y2="scaleY(value)" />
            <text :x="left - 6" :y="scaleY(value) + 4" text-anchor="end">{{ formatTick(value) }}</text>
          </g>
          <text v-for="time in xTicks" :key="time" class="axis" :x="scaleX(time)" y="154" text-anchor="middle">
            <tspan>{{ range.dateAxis ? day.format(time) : clock.format(time) }}</tspan>
            <tspan v-if="showTickDate" :x="scaleX(time)" dy="15">{{ day.format(time) }}</tspan>
          </text>
          <g v-for="line in lines" :key="`area-${line.key}`" :data-series-area="line.key" :fill="line.color" :fill-opacity="fillOpacity">
            <template v-for="(segment, index) in line.segments" :key="index">
              <path v-if="segment.area" class="metric-area" :d="segment.area" />
            </template>
          </g>
          <g v-for="line in lines" :key="line.key" :data-series="line.key" :stroke="line.color" :fill="line.color">
            <template v-for="(segment, index) in line.segments" :key="index">
              <circle v-if="segment.point" :cx="segment.point.x" :cy="segment.point.y" r="2" />
              <path v-else class="metric-line" :d="segment.path" fill="none" stroke-width="2" />
            </template>
            <circle v-if="Number.isFinite(active?.sample[line.key])" :cx="scaleX(active.time)" :cy="scaleY(active.sample[line.key])" r="3" />
          </g>
          <line v-if="active" class="metric-cursor" :x1="scaleX(active.time)" :x2="scaleX(active.time)" :y1="top" :y2="bottom" stroke="#8b9ab3" stroke-dasharray="3 3" />
        </svg>
        <p v-if="!hasValues" class="metric-empty">{{ emptyText }}</p>
        <div v-if="active" class="metric-tooltip" :class="{ 'is-touch': selectionMode === 'touch' }" :style="tooltipStyle" role="status">
          <time :datetime="active.sample.collectedAt">{{ formatDateTime(new Date(active.time)) }}</time>
          <div v-for="field in (tooltipFields ?? series)" :key="field.key" class="tooltip-reading">
            <span><i v-if="field.color" class="series-mark" :style="{ color: field.color }" />{{ field.label }}</span>
            <strong>{{ tooltipValue(field) }}</strong>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.metric-card { display: grid; align-content: space-between; min-width: 0; padding: 18px 20px 14px; background: #fff; border: 1px solid var(--abis-border); border-radius: 8px; }
.metric-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-bottom: 10px; }
.metric-heading h2 { margin: 0 auto 0 0; font-size: 16px; font-weight: 600; }
.metric-current { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 12px; color: var(--abis-muted); }
.metric-current strong { color: var(--el-text-color-primary); font-size: 15px; font-variant-numeric: tabular-nums; }
.metric-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 6px; }
.metric-legend { display: flex; align-items: center; gap: 10px; margin-left: auto; color: var(--abis-muted); font-size: 12px; }
.legend-unit { padding-inline-start: 8px; border-inline-start: 1px solid var(--abis-border); }
.series-mark { display: inline-block; width: 10px; height: 2px; margin-right: 5px; vertical-align: middle; background: currentColor; }
.metric-plot { min-width: 0; }
.metric-trend { position: relative; outline-offset: 4px; }
.metric-trend svg { display: block; touch-action: pan-y pinch-zoom; }
.axis line { stroke: #e4ebf4; }
.axis text, text.axis { fill: var(--abis-muted); font-size: 11px; }
.metric-tooltip { position: absolute; top: 10px; display: grid; gap: 4px; max-width: 100%; padding: 9px 11px; pointer-events: none; color: var(--el-text-color-primary); background: #fff; border: 1px solid var(--abis-border); border-radius: 6px; box-shadow: 0 3px 12px #142f5820; font-size: 12px; font-variant-numeric: tabular-nums; }
.metric-tooltip.is-touch { position: static; margin-top: 6px; }
.metric-tooltip time { color: var(--abis-muted); }
.tooltip-reading { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 10px; }
.tooltip-reading strong { white-space: nowrap; }
.metric-empty { position: absolute; inset: 0 0 26px; display: grid; place-items: center; color: var(--abis-muted); margin: 0; font-size: 13px; pointer-events: none; }
@media (max-width: 767px) { .metric-card { padding: 14px 12px 12px; } }
</style>
