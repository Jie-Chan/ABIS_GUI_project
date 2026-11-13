import { formatDateTime } from '@/utils/datetime'
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
export function buildHostResources() {
  const collectedAt = formatDateTime(new Date())
  return { items: MONITOR_HOSTS.map((host, index) => ({ ...host, sample: host.id === 'algorithm-vm-2' ? null : {
    cpuPercent: [24,31,57,0,36,29,33,22][index], memoryUsedGiB: [12,15,26,0,40,38,42,9][index], memoryTotalGiB: index > 3 && index < 7 ? 64 : 32,
    diskFreeGiB: [150,132,220,0,710,680,730,2400][index], diskTotalGiB: index === 7 ? 4096 : index > 3 ? 1024 : 512,
    mount: index === 7 ? '/data/minio' : index > 3 ? '/data/postgresql' : '/data', collectedAt,
  } })) }
}
