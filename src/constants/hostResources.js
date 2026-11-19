import { MONITOR_HOSTS } from '../mock/hosts.js'

const hostNames = {
  'app-1': '应用服务器 01（121）',
  'app-2': '应用服务器 02',
  'algorithm-vm-1': '算法服务 VM1',
  'algorithm-vm-2': '算法服务 VM2',
  'database-vm-1': 'PostgreSQL VM1',
  'database-vm-2': 'PostgreSQL VM2',
  'database-vm-3': 'PostgreSQL VM3',
  'minio-vm': 'MinIO VM',
}
export const HOST_RESOURCE_HOSTS = MONITOR_HOSTS.map(host => ({
  ...host,
  name: hostNames[host.id] ?? host.name,
  ip: host.id === 'app-1' ? '10.200.51.121' : host.ip,
}))

export const HOST_RESOURCES_PATH = '/abis-admin/monitor/hosts'
export const DEFAULT_HOST_RESOURCE_RANGE = '1h'

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour
export const HOST_RESOURCE_RANGES = Object.freeze({
  '1h': { label: '近 1 小时', type: '1m', durationMs: hour, intervalMs: minute },
  '12h': { label: '近 12 小时', type: '10m', durationMs: 12 * hour, intervalMs: 10 * minute },
  '24h': { label: '近 24 小时', type: '20m', durationMs: day, intervalMs: 20 * minute },
  '1w': { label: '近 7 天', type: '120m', durationMs: 7 * day, intervalMs: 2 * hour, dateAxis: true },
  '30d': { label: '近 30 天', type: '480m', durationMs: 30 * day, intervalMs: 8 * hour, dateAxis: true },
})
