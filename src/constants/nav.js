/**
 * 导航项与权限矩阵的唯一来源。
 *
 * 侧栏可见性（AdminLayout）与路由守卫（router）共用本表。
 * 需求 1.1 的权限矩阵在代码里只此一处 —— 两边一旦各写一份并漂移，
 * 就会出现「显示出点了会被弹回的入口」或「藏起一个本来能进的页面」这类自相矛盾。
 *
 * ⚠ 前端角色控制**不构成安全边界**：需求附录 A.2 要求权限在 ABIS 侧强制校验，
 *   本表与守卫只用于隐藏无权限入口，属于体验优化。
 */
import { PERMISSION } from '@/constants/roles'

/** 应用名 —— 侧栏品牌位与登录页标题指的是同一个东西 */
export const APP_NAME = 'ABIS 管理控制台'

/** 危险操作二次确认的对话框标题 —— 账户管理与阈值修改说的是同一句话 */
export const CONFIRM_TITLE = '二次确认'

/**
 * 五项导航。`component` 保持函数形式，路由侧拿到的是懒加载。
 * 顺序即侧栏顺序，也是路由 children 的顺序。
 */
export const NAV_ITEMS = [
  { name: 'monitor',   label: '服务状态监控', permission: PERMISSION.MONITOR_VIEW,   component: () => import('@/views/MonitorView.vue') },
  { name: 'threshold', label: '匹配阈值配置', permission: PERMISSION.THRESHOLD_EDIT, component: () => import('@/views/ThresholdView.vue') },
  { name: 'accounts',  label: '账户管理',     permission: PERMISSION.ACCOUNT_MANAGE, component: () => import('@/views/AccountView.vue') },
  { name: 'logs',      label: '日志查询',     permission: PERMISSION.LOG_VIEW,       component: () => import('@/views/LogView.vue') },
  { name: 'audits',    label: '审计查询',     permission: PERMISSION.AUDIT_VIEW,     component: () => import('@/views/AuditView.vue') },
]
