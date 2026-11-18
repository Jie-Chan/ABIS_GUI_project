import { ref, onBeforeUnmount } from 'vue'

// 输入中的条件与已展示结果分开。只有成功返回的最新请求才能替换结果及导出条件。
export function useAppliedQuery({ initialQuery, fetchPage, project = value => value, failureMessage, refreshFailureMessage = '数据暂未更新' }) {
  const query = ref({ ...initialQuery })
  const appliedQuery = ref(null)
  const timeRange = ref([])
  const rows = ref([])
  const total = ref(0)
  const metadata = ref({})
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref('')
  let sequence = 0
  onBeforeUnmount(() => { sequence++ })

  async function load(params, { background = false } = {}) {
    if (background && (loading.value || refreshing.value)) return
    const snapshot = { ...(params || query.value) }
    if (!params) {
      snapshot.startTime = timeRange.value?.[0] || ''
      snapshot.endTime = timeRange.value?.[1] || ''
    }
    if (snapshot.requestIds) snapshot.requestIds = [...snapshot.requestIds]
    const id = ++sequence
    loading.value = !background
    refreshing.value = background
    if (!background) error.value = ''
    try {
      const result = await fetchPage(snapshot)
      if (id !== sequence) return
      rows.value = result.items.map(project)
      total.value = result.total
      error.value = ''
      metadata.value = result
      if (!background) {
        appliedQuery.value = snapshot
        query.value.page = snapshot.page
        query.value.pageSize = snapshot.pageSize
      }
      return result
    } catch (e) {
      if (id === sequence) error.value = background ? `${refreshFailureMessage}${e.message ? `：${e.message}` : ''}` : e.message || failureMessage
    } finally {
      if (id === sequence) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  function search() { return load({ ...query.value, page: 1, startTime: timeRange.value?.[0] || '', endTime: timeRange.value?.[1] || '' }) }
  function resetQuery(values) {
    query.value = { ...(values || initialQuery) }
    timeRange.value = []
    return load()
  }
  function changePage(page) {
    if (appliedQuery.value && page !== appliedQuery.value.page) return load({ ...appliedQuery.value, page })
  }
  function changePageSize(pageSize) {
    return load({ ...(appliedQuery.value || initialQuery), page: 1, pageSize })
  }
  function refresh() {
    if (appliedQuery.value) return load(appliedQuery.value, { background: true })
  }
  return { query, appliedQuery, timeRange, rows, total, metadata, loading, refreshing, error, load, refresh, search, resetQuery, changePage, changePageSize }
}
