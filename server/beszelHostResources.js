import { readFileSync } from 'node:fs'
import { DEFAULT_HOST_RESOURCE_RANGE, HOST_RESOURCES_PATH, HOST_RESOURCE_HOSTS, HOST_RESOURCE_RANGES } from '../src/constants/hostResources.js'

const SAMPLE_FIELDS = [
  'created', 'stats.cpu', 'stats.cpub',
  'stats.mp', 'stats.mu', 'stats.m', 'stats.mem', 'stats.swap', 'stats.mb', 'stats.su', 'stats.s',
  'stats.du', 'stats.d', 'stats.dp', 'stats.dio', 'stats.dios', 'stats.b',
].join(',')
const hostDirectory = new Map(HOST_RESOURCE_HOSTS.map(host => [host.id, host]))

export function loadBeszelConfig(file) {
  let config
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new Error('无法读取 config/beszel.json，请检查文件和 JSON 格式')
  }
  const hub = config?.hub
  const baseUrl = URL.canParse(hub?.baseUrl) ? new URL(hub.baseUrl) : null
  const envNames = [hub?.usernameEnv, hub?.passwordEnv]
  if (hub?.tokenEnv !== undefined) envNames.push(hub.tokenEnv)
  if (!baseUrl || !['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password
    || !envNames.every(name => typeof name === 'string' && /^[a-z_][a-z0-9_]*$/i.test(name) && !/^VITE_/i.test(name))) {
    throw new Error('config/beszel.json 的 Hub 地址或服务端环境变量名无效')
  }
  if (!Array.isArray(config.hosts)) throw new Error('config/beszel.json 缺少 hosts 列表')
  const hostIds = new Set()
  const systemIds = new Set()
  const mappings = config.hosts.map(entry => {
    const { hostId, systemId } = entry ?? {}
    if (!hostDirectory.has(hostId) || typeof systemId !== 'string' || !/^[a-z0-9]{15}$/i.test(systemId)
      || hostIds.has(hostId) || systemIds.has(systemId)) {
      throw new Error('config/beszel.json 含未知主机、无效系统 ID 或重复映射')
    }
    hostIds.add(hostId)
    systemIds.add(systemId)
    return { host: hostDirectory.get(hostId), systemId }
  })
  return { baseUrl, hub, envNames, mappings }
}

function pocketBaseTime(time) {
  return new Date(time).toISOString().replace('T', ' ')
}

function metric(value) {
  return Number.isFinite(value) && value >= 0 ? value : null
}

function gibibytes(bytes, legacyGiB) {
  const value = metric(bytes)
  return value === null ? metric(legacyGiB) : value / (2 ** 30)
}

function normalizeHistory(records, start, end) {
  const samples = new Map()
  for (const record of records) {
    const time = typeof record?.created === 'string' ? Date.parse(record.created.replace(' ', 'T')) : NaN
    if (!Number.isFinite(time) || time < start || time > end) continue
    const stats = record.stats
    samples.set(time, {
      collectedAt: new Date(time).toISOString(),
      cpuPercent: metric(stats?.cpu),
      cpuUserPercent: metric(stats?.cpub?.[0]),
      cpuSystemPercent: metric(stats?.cpub?.[1]),
      cpuIowaitPercent: metric(stats?.cpub?.[2]),
      memoryPercent: metric(stats?.mp),
      memoryUsedGiB: metric(stats?.mu),
      memoryTotalGiB: metric(stats?.m),
      memoryCacheGiB: gibibytes(stats?.mem?.[2], stats?.mb),
      swapUsedGiB: gibibytes(stats?.swap?.[1], stats?.su),
      swapTotalGiB: gibibytes(stats?.swap?.[0], stats?.s),
      diskPercent: metric(stats?.dp),
      diskUsedGiB: metric(stats?.du),
      diskTotalGiB: metric(stats?.d),
      diskReadBps: metric(stats?.dio?.[0]),
      diskWriteBps: metric(stats?.dio?.[1]),
      diskReadLatencyMs: metric(stats?.dios?.[3]),
      diskWriteLatencyMs: metric(stats?.dios?.[4]),
      netRxBps: metric(stats?.b?.[1]),
      netTxBps: metric(stats?.b?.[0]),
    })
  }
  return [...samples].sort(([first], [second]) => first - second).map(([, sample]) => sample)
}

function sendJson(response, status, body, time) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  if (time !== undefined) response.setHeader('Date', new Date(time).toUTCString())
  response.end(JSON.stringify(body))
}

const failedHost = host => ({ ...host, sample: null, history: [], sampleError: true, historyError: true })

/** 仅用于内网 Vite Mock。凭据和 Hub 记录留在服务端。 */
export function beszelHostResourcesPlugin(config, env) {
  const { baseUrl, hub, mappings } = config
  const identity = env[hub.usernameEnv]
  const password = env[hub.passwordEnv]
  const canLogin = Boolean(identity && password)
  let token = env[hub.tokenEnv]
  let pendingLogin
  const pending = new Map()

  async function hubJson(path, signal, options = {}) {
    const response = await fetch(new URL(path, baseUrl), { ...options, signal, redirect: 'error' })
    if (!response.ok) throw Object.assign(new Error('Beszel 读取失败'), { status: response.status })
    return response.json()
  }

  function signIn() {
    pendingLogin ??= hubJson('/api/collections/users/auth-with-password', AbortSignal.timeout(10000), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity, password }),
    }).then(session => {
      if (typeof session.token !== 'string' || !session.token) throw new Error('Beszel 登录未返回令牌')
      token = session.token
      return token
    }).finally(() => {
      pendingLogin = undefined
    })
    return pendingLogin
  }

  async function checkHost(systemId, sessionToken, signal) {
    const system = await hubJson(`/api/collections/systems/records/${systemId}?fields=id`, signal, {
      headers: { Authorization: sessionToken },
    })
    if (system.id !== systemId) throw new Error('Beszel 系统与主机映射不一致')
  }

  async function authorize(systemId, signal) {
    const reusedToken = Boolean(token)
    const current = token || await signIn()
    try {
      // PocketBase 可将无权读取的列表返回为空。先确认当前账号可读取映射的系统。
      await checkHost(systemId, current, signal)
      return current
    } catch (error) {
      if (!reusedToken || !canLogin || ![401, 403, 404].includes(error.status)) throw error
      const updated = token !== current ? token : await signIn()
      await checkHost(systemId, updated, signal)
      return updated
    }
  }

  async function readHistory(systemId, range, end, sessionToken, signal, latestOnly = false) {
    const { durationMs, type } = HOST_RESOURCE_RANGES[range]
    const start = end - durationMs
    const query = new URLSearchParams({
      filter: `system = "${systemId}" && type = "${type}" && created >= "${pocketBaseTime(start)}" && created <= "${pocketBaseTime(end)}"`,
      sort: latestOnly ? '-created' : 'created',
      perPage: latestOnly ? '1' : '100',
      fields: SAMPLE_FIELDS,
    })
    const records = []
    let pages = 1
    for (let page = 1; page <= pages; page++) {
      query.set('page', String(page))
      const result = await hubJson(`/api/collections/system_stats/records?${query}`, signal, {
        headers: { Authorization: sessionToken },
      })
      if (!Array.isArray(result.items)) throw new Error('Beszel 样本响应无效')
      records.push(...result.items)
      if (page === 1 && !latestOnly && Number.isInteger(result.totalPages)) pages = result.totalPages
    }
    return normalizeHistory(records, start, end)
  }

  async function readHost({ host, systemId }, range, end) {
    const signal = AbortSignal.timeout(10000)
    let sessionToken
    try {
      sessionToken = await authorize(systemId, signal)
    } catch {
      return failedHost(host)
    }
    const minutesOnly = range === DEFAULT_HOST_RESOURCE_RANGE
    const minutes = readHistory(systemId, DEFAULT_HOST_RESOURCE_RANGE, end, sessionToken, signal, !minutesOnly)
    const trend = minutesOnly ? minutes : readHistory(systemId, range, end, sessionToken, signal)
    const [current, history] = await Promise.allSettled([minutes, trend])
    return {
      ...host,
      sample: current.value?.at(-1) ?? null,
      history: history.value ?? [],
      ...(current.status === 'rejected' ? { sampleError: true } : {}),
      ...(history.status === 'rejected' ? { historyError: true } : {}),
    }
  }

  async function read(range) {
    const end = Math.floor(Date.now() / 1000) * 1000
    if (mappings.length && !token && !canLogin) {
      return { end, status: 503, items: mappings.map(({ host }) => failedHost(host)) }
    }
    const items = await Promise.all(mappings.map(mapping => readHost(mapping, range, end)))
    const status = items.length && items.every(item => item.sampleError && item.historyError) ? 502 : 200
    return { end, status, items }
  }

  return {
    name: 'abis-beszel-host-resources',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== HOST_RESOURCES_PATH) return next()
        if (request.method !== 'GET') {
          response.setHeader('Allow', 'GET')
          return sendJson(response, 405, { message: '主机资源接口只接受 GET' })
        }
        if (['cross-site', 'same-site'].includes(request.headers['sec-fetch-site'])) {
          return sendJson(response, 403, { message: '请从 ABIS 页面读取主机资源' })
        }
        const values = new URL(request.url, 'http://localhost').searchParams.getAll('range')
        const range = values[0] ?? DEFAULT_HOST_RESOURCE_RANGE
        if (values.length > 1 || !Object.hasOwn(HOST_RESOURCE_RANGES, range)) {
          return sendJson(response, 400, { message: '主机资源时间范围无效' })
        }
        if (!pending.has(range)) pending.set(range, read(range).finally(() => pending.delete(range)))
        try {
          const { end, status, items } = await pending.get(range)
          sendJson(response, status, { items }, end)
        } catch {
          sendJson(response, 502, { message: '读取主机资源失败，请稍后重试' })
        }
      })
    },
  }
}
