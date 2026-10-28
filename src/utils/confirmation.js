import { h } from 'vue'

/** 只调整确认内容的展示；动态账户名作为文本节点渲染，不解析 HTML。 */
export function buildConfirmationMessage(question, details = []) {
  return h('div', { class: 'confirmation-copy' }, [
    h('p', { class: 'confirmation-question' }, question),
    details.length ? h('div', { class: 'confirmation-details' }, details.map(detail => h('p', detail))) : null,
  ])
}
