/**
 * 两级固定角色与权限矩阵
 * 账户职责按 2026-10-27 接口开发文档：管理员管理账户，运维员查看及重置运维员密码。
 *
 * ⚠ 此矩阵仅用于前端导航可见性与路由守卫，**不构成安全边界**。
 *   需求附录 A.2 明确要求：两级固定角色的权限须在 ABIS 侧强制校验。
 */

/** 角色标识 */
export const ROLE = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
}

/** 角色显示名 */
export const ROLE_LABEL = {
  [ROLE.ADMIN]: '管理员',
  [ROLE.OPERATOR]: '运维员',
}

/** 权限点 */
export const PERMISSION = {
  MONITOR_VIEW: 'monitor:view',
  LOG_VIEW: 'log:view',
  AUDIT_VIEW: 'audit:view',
  THRESHOLD_EDIT: 'threshold:edit',
  ACCOUNT_MANAGE: 'account:manage',
  ACCOUNT_VIEW: 'account:list',
  ACCOUNT_RESET_PASSWORD: 'account:reset-password',
}

/** 界面权限；目标账户的角色仍需在密码重置时单独判断。 */
export const ROLE_PERMISSIONS = {
  [ROLE.ADMIN]: [
    PERMISSION.MONITOR_VIEW,
    PERMISSION.LOG_VIEW,
    PERMISSION.AUDIT_VIEW,
    PERMISSION.THRESHOLD_EDIT,
    PERMISSION.ACCOUNT_MANAGE,
    PERMISSION.ACCOUNT_VIEW,
    PERMISSION.ACCOUNT_RESET_PASSWORD,
  ],
  [ROLE.OPERATOR]: [
    PERMISSION.MONITOR_VIEW,
    PERMISSION.LOG_VIEW,
    PERMISSION.AUDIT_VIEW,
    PERMISSION.ACCOUNT_VIEW,
    PERMISSION.ACCOUNT_RESET_PASSWORD,
  ],
}

/** 判断某角色是否具备某权限 */
export function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role]
  return Array.isArray(granted) && granted.includes(permission)
}

export function canResetAccountPassword(role, targetRole) {
  return hasPermission(role, PERMISSION.ACCOUNT_RESET_PASSWORD) && (
    (role === ROLE.ADMIN && [ROLE.ADMIN, ROLE.OPERATOR].includes(targetRole)) ||
    (role === ROLE.OPERATOR && targetRole === ROLE.OPERATOR)
  )
}
