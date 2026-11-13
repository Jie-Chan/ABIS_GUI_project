import { deployment } from '@/mock/hosts'
import { formatDateTime } from '@/utils/datetime'

export function buildMonitorSnapshot() {
  const normal = id => ({ id, status: 'normal' })
  return {
    fetchedAt: formatDateTime(new Date()),
    items: [
      { key: 'system', name: 'ABIS-System', instances: [{ ...normal('system-1'), host: deployment('app-1') }, { ...normal('system-2'), host: deployment('app-2') }] },
      { key: 'algorithm-1', name: '算法服务 1', host: deployment('algorithm-vm-1'), instances: [{ id: 'face-1', name: '人脸服务', status: 'abnormal' }, { ...normal('fingerprint-1'), name: '指纹服务' }] },
      { key: 'algorithm-2', name: '算法服务 2', host: deployment('algorithm-vm-2'), instances: [{ ...normal('face-2'), name: '人脸服务' }, { ...normal('fingerprint-2'), name: '指纹服务' }] },
      { key: 'postgresql', name: 'PostgreSQL', instances: [1,2,3].map(index => ({ ...normal(`postgresql-${index}`), host: deployment(`database-vm-${index}`) })) },
      { key: 'minio', name: 'MinIO', instances: [{ id: 'minio-1', status: 'unknown', host: deployment('minio-vm') }] },
    ],
  }
}
