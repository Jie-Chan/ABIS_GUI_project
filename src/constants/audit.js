/** 审计动作及筛选选项。 */
export const AUDIT_ACTION = {
  LOGIN: '登录',
  LOGIN_SUCCESS: '登录成功',
  LOGIN_FAILED: '登录失败',
  LOGOUT: '登出',
  UPDATE_THRESHOLD: '修改匹配阈值',
  CREATE_ACCOUNT: '创建账户',
  DISABLE_ACCOUNT: '禁用账户',
  RESET_PASSWORD: '密码重置',
}

/** 下拉选项顺序 */
export function normalizeAuditAction(action) {
  return [AUDIT_ACTION.LOGIN_SUCCESS, AUDIT_ACTION.LOGIN_FAILED].includes(action) ? AUDIT_ACTION.LOGIN : action
}
export const AUDIT_ACTIONS = [...new Set(Object.values(AUDIT_ACTION).map(normalizeAuditAction))]
