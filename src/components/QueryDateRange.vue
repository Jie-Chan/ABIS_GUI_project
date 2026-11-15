<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { TIME_RANGE_SHORTCUTS } from '@/constants/timeRanges'
import { formatDateTime } from '@/utils/datetime'

const range = defineModel({ type: Array, default: () => [] })
const narrow = ref(false)
const opened = ref(false)
const endpoint = ref('start')
const calendarDate = ref(new Date())
const dates = ref({ start: '', end: '' })
const times = ref({ start: '00:00:00', end: '23:59:59' })
const validation = ref('')
let media
function updateViewport() { narrow.value = media.matches }
onMounted(() => { media = window.matchMedia('(max-width: 767px)'); updateViewport(); media.addEventListener('change', updateViewport) })
onBeforeUnmount(() => media?.removeEventListener('change', updateViewport))
function open() {
  dates.value = { start: range.value?.[0]?.slice(0, 10) || '', end: range.value?.[1]?.slice(0, 10) || '' }
  times.value = { start: range.value?.[0]?.slice(11) || '00:00:00', end: range.value?.[1]?.slice(11) || '23:59:59' }
  endpoint.value = 'start'
  calendarDate.value = dates.value.start ? new Date(`${dates.value.start}T12:00:00`) : new Date()
  validation.value = ''
  opened.value = true
}
function choose(day) {
  dates.value[endpoint.value] = day
  calendarDate.value = new Date(`${day}T12:00:00`)
  validation.value = ''
  if (endpoint.value === 'start') endpoint.value = 'end'
}
function pickEndpoint(value) {
  endpoint.value = value
  if (dates.value[value]) calendarDate.value = new Date(`${dates.value[value]}T12:00:00`)
}
function shortcut(item) {
  const values = item.value().map(formatDateTime)
  dates.value = { start: values[0].slice(0, 10), end: values[1].slice(0, 10) }
  times.value = { start: values[0].slice(11), end: values[1].slice(11) }
  calendarDate.value = new Date(`${dates.value.start}T12:00:00`)
}
function confirm() {
  const values = ['start', 'end'].map(key => `${dates.value[key]} ${times.value[key].length === 5 ? `${times.value[key]}:00` : times.value[key]}`)
  if (!dates.value.start || !dates.value.end || !times.value.start || !times.value.end) { validation.value = '请选择完整的起止日期和时间'; return }
  if (values[0] > values[1]) { validation.value = '结束时间须晚于或等于开始时间'; return }
  range.value = values
  opened.value = false
}
function clear() { range.value = []; opened.value = false }
</script>
<template>
  <el-date-picker v-if="!narrow" v-model="range" type="datetimerange" :shortcuts="TIME_RANGE_SHORTCUTS" value-format="YYYY-MM-DD HH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间" popper-class="query-date-popper" />
  <div v-else class="range-field">
    <button type="button" class="range-trigger" aria-label="选择时间范围" @click="open">
      <span :class="{ placeholder: !range?.[0] }">{{ range?.[0] || '开始时间' }}</span><span class="separator">至</span><span :class="{ placeholder: !range?.[1] }">{{ range?.[1] || '结束时间' }}</span>
    </button>
    <el-dialog v-model="opened" title="选择时间范围" class="single-month-range" width="min(540px, calc(100vw - 24px))" top="12px" append-to-body>
      <div class="range-shortcuts"><el-button v-for="item in TIME_RANGE_SHORTCUTS" :key="item.text" size="small" @click="shortcut(item)">{{ item.text }}</el-button></div>
      <div class="range-endpoints">
        <button v-for="key in ['start', 'end']" :key="key" type="button" :class="{ selected: endpoint === key }" @click="pickEndpoint(key)">{{ key === 'start' ? '开始日期' : '结束日期' }}<strong>{{ dates[key] || '请选择日期' }}</strong></button>
      </div>
      <el-calendar v-model="calendarDate" class="range-calendar">
        <template #date-cell="{ data }"><button type="button" :aria-label="data.day" :class="{ 'range-day': true, 'is-endpoint': data.day === dates.start || data.day === dates.end, 'in-range': dates.start && dates.end && data.day > dates.start && data.day < dates.end }" @click.stop="choose(data.day)">{{ Number(data.day.slice(-2)) }}</button></template>
      </el-calendar>
      <div class="range-times"><label>开始时间<input v-model="times.start" type="time" step="1" aria-label="开始时间" /></label><label>结束时间<input v-model="times.end" type="time" step="1" aria-label="结束时间" /></label></div>
      <p v-if="validation" class="range-validation" role="alert">{{ validation }}</p>
      <template #footer><el-button @click="clear">清空</el-button><el-button type="primary" @click="confirm">确定</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.range-field { width: 100%; min-width: 0; }
.range-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 36px; padding: 6px 11px; border: 1px solid var(--el-border-color); border-radius: 4px; background: #fff; color: var(--el-text-color-regular); font-size: 12px; cursor: pointer; gap: 5px; }
.range-trigger .placeholder,.separator { color: var(--abis-muted); }
:global(.single-month-range) { display: flex; flex-direction: column; max-height: calc(100dvh - 24px); margin-bottom: 12px; }
:global(.single-month-range .el-dialog__body) { overflow-y: auto; min-height: 0; }
:global(.single-month-range .el-dialog__footer) { flex-shrink: 0; padding-top: 12px; background: #fff; border-top: 1px solid var(--abis-border); }
.range-shortcuts { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }.range-shortcuts .el-button { margin: 0; }
.range-endpoints { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.range-endpoints button { display: flex; flex-direction: column; gap: 5px; padding: 8px; border: 1px solid var(--abis-border); border-radius: 4px; color: var(--abis-muted); background: #fff; cursor: pointer; }.range-endpoints .selected { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }.range-endpoints strong { color: var(--el-text-color-primary); }
.range-calendar :deep(.el-calendar__header) { padding: 12px 0; flex-wrap: wrap; gap: 8px; }.range-calendar :deep(.el-calendar__body) { padding: 8px 0; }.range-calendar :deep(.el-calendar-day) { padding: 0; height: 38px; }.range-calendar :deep(th) { padding: 6px 0; }
.range-day { width: 100%; height: 100%; border: 0; background: transparent; color: inherit; cursor: pointer; }.range-day.is-endpoint { background: var(--el-color-primary); color: #fff; }.range-day.in-range { background: var(--el-color-primary-light-9); }
.range-times { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }.range-times label { min-width: 0; display: flex; flex-direction: column; gap: 6px; color: var(--abis-muted); font-size: 12px; }.range-times input { min-width: 0; width: 100%; box-sizing: border-box; border: 1px solid var(--abis-border); border-radius: 4px; padding: 8px; color: var(--el-text-color-primary); }.range-validation { color: var(--el-color-danger); font-size: 12px; }
@media(max-width:400px) { .range-trigger { flex-wrap: wrap; }.range-trigger span:not(.separator) { flex: 1 0 80%; }.range-trigger .separator { display: none; } }
</style>
