export const OPTIONAL_ACCOUNT_FIELDS = ['phone', 'email', 'remark']

export function optionalAccountText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '-'
}

export function optionalAccountFields(account) {
  return Object.fromEntries(OPTIONAL_ACCOUNT_FIELDS.map(key => [key, optionalAccountText(account?.[key])]))
}
