/**
 * 导出动作的两句用户反馈 —— 导出由本模块承载，各调用页面共用同一处文案。
 * 页面保留 `e.message ||` 兜底写法，只把兜底的那句字面量放在这里。
 */
export const EXPORT_STARTED_MESSAGE = '导出已开始'
export const EXPORT_FAILED_MESSAGE = '导出失败'

/** 触发浏览器下载一个 Blob */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** 生成带时间戳的文件名 */
export function timestampedName(prefix, ext = 'csv') {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${prefix}_${stamp}.${ext}`
}
