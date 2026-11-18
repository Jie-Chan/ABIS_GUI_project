import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

/** 表格按视口剩余高度滚动；短列表保持自然高度，表头由 el-table 同步横向位置。 */
export function useRecordsTable(rows, { resetScroll = () => true } = {}) {
  const tableRef = ref(null)
  const tableMaxHeight = ref(null)
  let observer, frame
  const number = value => Number.parseFloat(value) || 0
  function measure() {
    const table = tableRef.value?.$el
    const card = table?.closest('.el-card__body')
    if (!card) return
    const footer = card.querySelector('.records-footer')
    const main = card.closest('.workspace-main')
    const bottom = number(getComputedStyle(card).paddingBottom) + (main ? number(getComputedStyle(main).paddingBottom) : 0)
    const footerHeight = footer ? footer.getBoundingClientRect().height + number(getComputedStyle(footer).marginTop) : 0
    tableMaxHeight.value = Math.max(100, Math.floor(innerHeight - table.getBoundingClientRect().top - footerHeight - bottom - 2))
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
  watch(rows, async () => { const reset = resetScroll(); await nextTick(); if (reset) tableRef.value?.setScrollTop(0); schedule() }, { flush: 'sync' })
  onMounted(() => {
    observer = new ResizeObserver(schedule)
    const card = tableRef.value?.$el.closest('.el-card__body')
    for (const element of [card, card?.querySelector('.query-panel'), card?.querySelector('.records-footer'), document.querySelector('.header')].filter(Boolean)) observer.observe(element)
    window.addEventListener('resize', schedule)
    schedule()
  })
  onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule) })
  return { tableRef, tableMaxHeight }
}
