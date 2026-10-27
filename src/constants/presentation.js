// 展示元信息；不参与接口选择、路由或权限判断。
// 数据来源的判断须与 src/api/index.js 的默认 Mock 规则一致。
export const isMockPreview = import.meta.env.VITE_USE_MOCK !== 'false'
export const dataSourceLabel = isMockPreview ? 'Mock 演示数据' : 'HTTP 接口数据'
export const dataSourceNote = isMockPreview
  ? '当前为 Mock 演示，所有状态和操作均使用模拟数据。'
  : '当前使用 HTTP 适配器，数据可用性以接口响应为准。'

export const PAGE_DESCRIPTIONS = {
  monitor: '查看各层服务状态与实例运行信息',
  threshold: '管理人脸与指纹识别的默认匹配阈值',
  accounts: '管理控制台账户、角色与访问状态',
  logs: '检索业务接口调用记录与处理结果',
  audits: '追溯控制台操作与配置变更记录',
}
