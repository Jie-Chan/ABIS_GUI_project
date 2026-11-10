/**
 * 账户 mock 数据
 * 来源：《ABIS-GUI管理平台需求分析》1.1 用户与权限管理
 */
import { ROLE } from '@/constants/roles'

export const mockAccounts = [
  { id: 1, username: 'admin',     displayName: '系统管理员', role: ROLE.ADMIN,    enabled: true,  createdAt: '2026-08-01 09:12:00', lastLoginAt: '2026-09-14 08:31:22' },
  { id: 2, username: 'ops.zhang', displayName: '张运维',     role: ROLE.OPERATOR, enabled: true,  createdAt: '2026-08-03 10:20:00', lastLoginAt: '2026-09-14 09:05:10' },
  { id: 3, username: 'ops.li',    displayName: '李运维',     role: ROLE.OPERATOR, enabled: true,  createdAt: '2026-08-05 14:02:00', lastLoginAt: '2026-09-12 17:44:03' },
  { id: 4, username: 'ops.chen',  displayName: '陈运维',     role: ROLE.OPERATOR, enabled: false, createdAt: '2026-08-11 11:35:00', lastLoginAt: '2026-09-09 09:18:47' },
]

/**
 * mock 登录凭据 —— 仅用于骨架演示。
 * 真实认证在 ABIS 侧，密码以加盐哈希存储（需求 1.1）。
 */
export const mockCredentials = [
  { username: 'admin',     password: 'admin123', accountId: 1 },
  { username: 'ops.zhang', password: 'ops123',   accountId: 2 },
]
