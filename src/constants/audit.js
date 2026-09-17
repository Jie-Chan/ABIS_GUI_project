/** 审计动作词表 —— 单一来源。视图的下拉选项与 mock 记录共用，不得各写一份。 */
export const AUDIT_ACTION = {
  LOGIN_SUCCESS: '登录成功',
  LOGIN_FAILED: '登录失败',
  LOGOUT: '登出',
  UPDATE_THRESHOLD: '修改匹配阈值',
  CREATE_ACCOUNT: '创建账户',
  DISABLE_ACCOUNT: '禁用账户',
  RESET_PASSWORD: '密码重置',
}

/** 下拉选项顺序（与 mock 记录顺序无关，仅决定界面排列） */
export const AUDIT_ACTIONS = Object.values(AUDIT_ACTION)
