/**
 * 两级固定角色与权限矩阵
 * 来源：《ABIS-GUI管理平台需求分析》1.1 角色与权限
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
}

/** 权限矩阵 —— 严格对应需求 1.1 的表格，不得增删 */
export const ROLE_PERMISSIONS = {
  [ROLE.ADMIN]: [
    PERMISSION.MONITOR_VIEW,
    PERMISSION.LOG_VIEW,
    PERMISSION.AUDIT_VIEW,
    PERMISSION.THRESHOLD_EDIT,
    PERMISSION.ACCOUNT_MANAGE,
  ],
  [ROLE.OPERATOR]: [
    PERMISSION.MONITOR_VIEW,
    PERMISSION.LOG_VIEW,
    PERMISSION.AUDIT_VIEW,
  ],
}

/** 判断某角色是否具备某权限 */
export function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role]
  return Array.isArray(granted) && granted.includes(permission)
}
