export const MONITOR_HOSTS = [
  { id: 'app-1', name: '应用服务器 1', ip: '192.0.2.11' },
  { id: 'app-2', name: '应用服务器 2', ip: '192.0.2.12' },
  { id: 'algorithm-vm-1', name: '算法 VM 1', ip: '192.0.2.21' },
  { id: 'algorithm-vm-2', name: '算法 VM 2', ip: '192.0.2.22' },
  { id: 'database-vm-1', name: '数据库 VM 1', ip: '192.0.2.31' },
  { id: 'database-vm-2', name: '数据库 VM 2', ip: '192.0.2.32' },
  { id: 'database-vm-3', name: '数据库 VM 3', ip: '192.0.2.33' },
  { id: 'minio-vm', name: 'MinIO VM', ip: '192.0.2.41' },
]
export const deployment = id => ({ ...MONITOR_HOSTS.find(host => host.id === id) })
