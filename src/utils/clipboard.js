/** 普通 HTTP 访问也支持复制；仅在用户点击后调用。 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return } catch { /* 使用浏览器的兼容复制入口。 */ }
  }
  const previous = document.activeElement
  const input = document.createElement('textarea')
  input.value = text
  input.setAttribute('readonly', '')
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.append(input)
  try {
    input.select()
    if (!document.execCommand('copy')) throw new Error('复制失败，请选择请求 ID 手动复制')
  } finally {
    input.remove()
    previous?.focus({ preventScroll: true })
  }
}
