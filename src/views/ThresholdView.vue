<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { buildConfirmationMessage } from '@/utils/confirmation'
import { CONFIRM_TITLE } from '@/constants/nav'
import {
  THRESHOLD_MIN,
  THRESHOLD_MAX,
  THRESHOLD_KEYS,
  DEFAULT_THRESHOLDS,
  buildLowerBoundMessage,
  allowsBelowLowerBound,
  lowerBoundAlertType,
} from '@/constants/threshold'

const route = useRoute()
const auth = useAuthStore()
const title = computed(() => route.meta.title || '')
const loading = ref(false)
const saving = ref(false)
const confirming = ref(false)
const error = ref('')
const recoveryRequired = ref(false)
const hasLoaded = ref(false)

const form = ref({ face: null, finger: null })
const origin = ref({ face: null, finger: null })

const dirty = computed(() => hasLoaded.value && THRESHOLD_KEYS.some(({ key }) => form.value[key] !== origin.value[key]))
const busy = computed(() => loading.value || saving.value || confirming.value)
const writeBlocked = computed(() => busy.value || recoveryRequired.value || !hasLoaded.value)

// 当前 InputNumber 仅在挂载时设置 aria-disabled，动态恢复可编辑后需同步给辅助技术。
function syncDisabledAttribute(el, { value }) {
  el.querySelector('input')?.setAttribute('aria-disabled', String(value))
}
const vSyncDisabled = { mounted: syncDisabledAttribute, updated: syncDisabledAttribute }

async function confirmDiscard(question) {
  confirming.value = true
  try {
    await ElMessageBox.confirm(buildConfirmationMessage(question, ['尚未保存的修改将被丢弃。']), '未保存的修改', {
      type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑',
    })
    return true
  } catch { return false }
  finally { confirming.value = false }
}

onBeforeRouteLeave(async () => {
  // 注销或认证失效后应正常进入登录页。
  if (!auth.isLoggedIn) return true
  if (busy.value) {
    ElMessage.warning('请等待当前操作完成后再离开')
    return false
  }
  if (recoveryRequired.value) return true
  return !dirty.value || await confirmDiscard('存在未保存的阈值修改，确认离开？')
})

function beforeUnload(event) {
  if (recoveryRequired.value || (!dirty.value && !saving.value)) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

const lowerBoundHints = computed(() =>
  THRESHOLD_KEYS
    .filter((k) => form.value[k.key] !== null && form.value[k.key] < k.protocolLowerBound)
    .map((k) => ({
      key: k.key,
      text: buildLowerBoundMessage(k.label, form.value[k.key], k.protocolLowerBound),
    }))
)

function validate() {
  for (const k of THRESHOLD_KEYS) {
    const v = form.value[k.key]
    if (!Number.isInteger(v) || v < THRESHOLD_MIN || v > THRESHOLD_MAX) {
      ElMessage.error(`${k.label}须为 ${THRESHOLD_MIN}–${THRESHOLD_MAX} 的整数`)
      return false
    }
    if (!allowsBelowLowerBound(v, k.protocolLowerBound)) {
      ElMessage.error(buildLowerBoundMessage(k.label, v, k.protocolLowerBound))
      return false
    }
  }
  return true
}

async function load() {
  loading.value = true
  if (!recoveryRequired.value) error.value = ''
  try {
    const result = await api.getThresholds()
    form.value = { ...result }
    origin.value = { ...result }
    hasLoaded.value = true
    recoveryRequired.value = false
    error.value = ''
  } catch (e) {
    error.value = `读取失败，请刷新页面重试。${e.message || ''}`
  } finally {
    loading.value = false
  }
}

async function saveThresholds(values) {
  if (writeBlocked.value || !dirty.value) return
  const payload = { ...values }

  confirming.value = true
  try {
    await ElMessageBox.confirm(
      buildConfirmationMessage('确认保存阈值配置？', [
        `人脸阈值：${origin.value.face} → ${payload.face}`,
        `指纹阈值：${origin.value.finger} → ${payload.finger}`,
      ]),
      CONFIRM_TITLE,
      { type: 'warning' }
    )
  } catch {
    return
  } finally {
    confirming.value = false
  }

  saving.value = true
  try {
    const result = await api.updateThresholds(payload)
    form.value = { ...result }
    origin.value = { ...result }
    error.value = ''
    ElMessage.success('阈值已保存')
  } catch (e) {
    if (e.code === 'THRESHOLD_READBACK_FAILED') {
      recoveryRequired.value = true
      error.value = '配置已保存，但暂时无法确认当前值，请刷新页面确认。确认前请勿重复提交。'
    } else {
      ElMessage.error(e.message || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

function handleSave() {
  if (!writeBlocked.value && dirty.value && validate()) return saveThresholds(form.value)
}

function handleReset() {
  if (writeBlocked.value) return
  form.value = { ...DEFAULT_THRESHOLDS }
}

onMounted(load)
</script>

<template>
  <div>
    <el-card v-loading="loading">
      <template #header>
        <div class="record-heading"><span>{{ title }}</span><el-tag type="info" size="small">1:N 去重</el-tag></div>
      </template>

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-alert
        v-for="hint in lowerBoundHints"
        :key="hint.key"
        :title="hint.text"
        :type="lowerBoundAlertType()"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-form label-position="top" class="threshold-form">
        <el-form-item v-for="k in THRESHOLD_KEYS" :key="k.key" :label="k.label" class="threshold-field">
          <el-input-number
            v-model="form[k.key]"
            v-sync-disabled="writeBlocked"
            :min="THRESHOLD_MIN"
            :max="THRESHOLD_MAX"
            :step="1"
            step-strictly
            :disabled="writeBlocked"
          />
          <span class="bound">协议生效下限：{{ k.protocolLowerBound }}</span>
        </el-form-item>

        <el-form-item class="threshold-actions">
          <el-button type="primary" :loading="saving" :disabled="writeBlocked || !dirty" @click="handleSave">保存修改</el-button>
          <el-button :disabled="writeBlocked" @click="handleReset">恢复默认值（60/60）</el-button>
          <span v-if="recoveryRequired" class="edit-state" role="status">配置待确认</span>
          <span v-else-if="dirty" class="edit-state" role="status">未保存</span>
        </el-form-item>
      </el-form>

      <p class="note">
        配置默认 1:N 去重阈值；调用方传入阈值时以请求为准。
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.threshold-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; max-width: 860px; }
.threshold-field { padding: 22px; margin: 0; background: #f7f9fc; border: 1px solid var(--abis-border); border-radius: 8px; }
.threshold-field :deep(.el-form-item__label) { margin-bottom: 18px; color: #3f526e; font-size: 13px; }
.threshold-field :deep(.el-form-item__content) { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.threshold-field :deep(.el-input-number) { width: 180px; max-width: 100%; }
.threshold-field :deep(.el-input__inner) { font-size: 20px; font-weight: 600; }
.threshold-field :deep(.el-input__wrapper) { height: 44px; }
.bound { color: #718096; font-size: 11px; }
.edit-state { margin-left: 12px; color: var(--el-color-warning); font-size: 13px; }
.threshold-actions :deep(.el-form-item__content) { gap: 8px 0; }
.threshold-actions { grid-column: 1 / -1; margin-bottom: 0; }
.note { margin: 24px 0 0; color: #718096; font-size: 12px; line-height: 1.8; }
@media (max-width: 900px) { .threshold-form { grid-template-columns: 1fr; } }
</style>
