export const OPTIONAL_ACCOUNT_FIELDS = ['phone', 'email', 'remark']

function optionalAccountValue(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text === '-' || text === '—' ? '' : text
}

export function optionalAccountText(value) {
  return optionalAccountValue(value) || '—'
}

// 接口沿用 '-' 空值约定；表单使用空字符串，详情显示 '—'。
export function optionalAccountFields(account, { emptyValue = '-' } = {}) {
  return Object.fromEntries(OPTIONAL_ACCOUNT_FIELDS.map(key => [key, optionalAccountValue(account?.[key]) || emptyValue]))
}
