/**
 * 监控状态与轮询
 * 需求 1.3：界面按固定周期刷新，初版周期 1 分钟。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { MONITOR_REFRESH_INTERVAL_MS } from '@/constants/monitor'

export const useMonitorStore = defineStore('monitor', () => {
  const items = ref([])
  const fetchedAt = ref('')
  const loading = ref(false)
  const error = ref('')

  let timer = null
  let sequence = 0
  let pending = null

  function refresh() {
    // 后台轮询不抢占仍在执行的读取；停用后的旧请求不阻塞重新进入页面。
    if (pending?.sequence === sequence) return pending.promise
    const current = ++sequence
    loading.value = true
    const request = { sequence: current, promise: null }
    pending = request
    request.promise = (async () => {
      try {
        const result = await api.getHealth()
        if (current !== sequence) return
        items.value = result.items
        fetchedAt.value = result.fetchedAt
        // 已中断的监控只在真正取得新数据后恢复正常。
        error.value = ''
      } catch (e) {
        if (current !== sequence) return
        error.value = e?.message || '获取监控状态失败'
      } finally {
        if (current === sequence) loading.value = false
        if (pending === request) pending = null
      }
    })()
    return request.promise
  }

  /** 启动轮询（1 分钟）。组件卸载时务必调用 stop() */
  function start() {
    stop()
    const refreshed = refresh()
    timer = setInterval(refresh, MONITOR_REFRESH_INTERVAL_MS)
    return refreshed
  }

  function stop() {
    ++sequence
    loading.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { items, fetchedAt, loading, error, refresh, start, stop }
})
