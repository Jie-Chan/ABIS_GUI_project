// 账户与业务查询均走真实服务，仅导出保留明确标记的 mock 样本。
export function createHybrid(remote, mock) {
  return {
    ...remote,
    exportLogs: params => mock.exportLogs(params),
    exportAudits: params => mock.exportAudits(params),
  }
}
