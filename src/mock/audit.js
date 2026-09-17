/**
 * 管理操作审计 mock 数据
 * 来源：《ABIS-GUI管理平台需求分析》2.2 审计记录字段（10 项）
 *
 * 十个字段：时间、操作人、角色、操作类型、操作对象、
 *          变更前值、变更后值、结果、来源 IP、会话 ID
 *
 * 审计范围仅覆盖管理操作（需求 2.1）：登录登出、账户变更、阈值变更。
 * 查询与导出行为本身不计入审计范围。
 */
import { ROLE, ROLE_LABEL } from '@/constants/roles'
import { AUDIT_ACTION } from '@/constants/audit'
import { formatDateTime } from '@/utils/datetime'

const OPERATORS = [
  { account: 'admin',     role: ROLE.ADMIN,    ip: '10.20.30.11' },
  { account: 'ops.zhang', role: ROLE.OPERATOR, ip: '10.20.30.24' },
  { account: 'ops.li',    role: ROLE.OPERATOR, ip: '10.20.30.31' },
]

/** 七个动作（八条记录）。hasChange 为 true 时才有变更前后值（需求 2.2） */
const ACTIONS = [
  { action: AUDIT_ACTION.LOGIN_SUCCESS,     target: '—',                    hasChange: false },
  // failed 标记「本次操作失败」这一**机器事实**；结果文案由它派生，
  // 不得反过来用 action 的中文文案去判断——文案一旦翻译，判断会静默失配，
  // 全部登录失败记录会改报「成功」，且无报错、无测试可拦。
  { action: AUDIT_ACTION.LOGIN_FAILED,      target: '—',                    hasChange: false, failed: true },
  { action: AUDIT_ACTION.LOGOUT,            target: '—',                    hasChange: false },
  { action: AUDIT_ACTION.UPDATE_THRESHOLD, target: '人脸 1:N 去重阈值',    hasChange: true,  from: 70,  to: 75 },
  { action: AUDIT_ACTION.UPDATE_THRESHOLD, target: '指纹 1:N 去重阈值',    hasChange: true,  from: 50,  to: 55 },
  { action: AUDIT_ACTION.CREATE_ACCOUNT,    target: 'ops.li',               hasChange: true,  from: '—', to: '运维员 / 启用' },
  { action: AUDIT_ACTION.DISABLE_ACCOUNT,   target: 'ops.chen',             hasChange: true,  from: '启用', to: '禁用' },
  { action: AUDIT_ACTION.RESET_PASSWORD,    target: 'ops.zhang',            hasChange: false },
]

/** 生成一批审计记录（数量固定，便于演示分页） */
export function buildAuditRecords(total = 64) {
  const records = []
  const base = new Date('2026-09-14T08:30:00')

  for (let i = 0; i < total; i += 1) {
    const operator = OPERATORS[i % OPERATORS.length]
    const spec = ACTIONS[i % ACTIONS.length]
    const operatedAt = new Date(base.getTime() - i * 11 * 60 * 1000)

    records.push({
      id: i + 1,
      operatedAt: formatDateTime(operatedAt),
      operator: operator.account,
      role: operator.role,
      roleLabel: ROLE_LABEL[operator.role],
      action: spec.action,
      target: spec.target,
      // 变更前后值仅变更类操作填写（需求 2.2）
      beforeValue: spec.hasChange ? String(spec.from) : '',
      afterValue: spec.hasChange ? String(spec.to) : '',
      result: spec.failed ? '失败' : '成功',
      sourceIp: operator.ip,
      sessionId: `sess-${String(1000 + Math.floor(i / 4))}`,
    })
  }

  return records
}
