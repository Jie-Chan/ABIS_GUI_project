/** 界面权限与目标账户保护；后端必须独立执行相同的授权规则。 */
export const ROLE = { ADMIN: 'admin', OPERATOR: 'operator' }
export const ROLE_LABEL = { [ROLE.ADMIN]: '管理员', [ROLE.OPERATOR]: '运维员' }

export const PERMISSION = {
  MONITOR_VIEW: 'monitor:view',
  LOG_VIEW: 'log:view',
  AUDIT_VIEW: 'audit:view',
  THRESHOLD_EDIT: 'threshold:edit',
  ACCOUNT_MANAGE: 'account:manage',
  ACCOUNT_VIEW: 'account:list',
  ACCOUNT_RESET_PASSWORD: 'account:reset-password',
  ACCOUNT_DELETE: 'account:delete',
}

export const ROLE_PERMISSIONS = {
  [ROLE.ADMIN]: Object.values(PERMISSION),
  [ROLE.OPERATOR]: [PERMISSION.MONITOR_VIEW, PERMISSION.LOG_VIEW, PERMISSION.AUDIT_VIEW, PERMISSION.THRESHOLD_EDIT],
}

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) === true
}

function validId(value) {
  return (typeof value === 'string' && value.trim().length > 0) || (typeof value === 'number' && Number.isSafeInteger(value))
}

function isOtherOperator(targetRole, actorId, targetId) {
  return targetRole === ROLE.OPERATOR && validId(actorId) && validId(targetId) && String(actorId) !== String(targetId)
}

export function canResetAccountPassword(role, targetRole, actorId, targetId) {
  return hasPermission(role, PERMISSION.ACCOUNT_RESET_PASSWORD) && isOtherOperator(targetRole, actorId, targetId)
}

export function canDeleteAccount(role, targetRole, actorId, targetId) {
  return hasPermission(role, PERMISSION.ACCOUNT_DELETE) && isOtherOperator(targetRole, actorId, targetId)
}

export function canChangeAccountRole(role, targetRole, actorId, targetId) {
  return hasPermission(role, PERMISSION.ACCOUNT_MANAGE) && isOtherOperator(targetRole, actorId, targetId)
}

export function canToggleAccountEnabled(role, targetRole, actorId, targetId, enabled) {
  if (!hasPermission(role, PERMISSION.ACCOUNT_MANAGE) || !validId(actorId) || !validId(targetId) || String(actorId) === String(targetId) || typeof enabled !== 'boolean') return false
  // Other operators can be enabled/disabled. An already disabled administrator
  // can be restored, but an enabled administrator must never be disabled here.
  return targetRole === ROLE.OPERATOR || (targetRole === ROLE.ADMIN && enabled === false)
}
